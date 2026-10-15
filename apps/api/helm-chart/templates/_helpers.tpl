{{- define "backoffice-api.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "backoffice-api.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "backoffice-api.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "backoffice-api.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/part-of: backoffice
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "backoffice-api.selectorLabels" -}}
app.kubernetes.io/name: {{ include "backoffice-api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- /*
A job's pod labels: never the API's selector labels, so the API's Service never sends a request to a job's pod. The
component names the job, and the jobs' network policies select on it.
*/}}
{{- define "backoffice-api.jobLabels" -}}
app.kubernetes.io/name: {{ include "backoffice-api.name" .root }}-{{ .component }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/part-of: backoffice
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- /* An env entry from a secret: (dict "name" "X" "secret" .Values.some.secret) with name and key. */}}
{{- define "backoffice-api.secretEnv" -}}
- name: {{ .name }}
  valueFrom:
    secretKeyRef:
      name: {{ .secret.name }}
      key: {{ .secret.key }}
{{- end }}

{{- /* The bot's token alone, for the jobs that send messages; the webhook secret stays with the API. */}}
{{- define "backoffice-api.telegramSendEnv" -}}
- name: TELEGRAM_BOT_TOKEN
  valueFrom:
    secretKeyRef:
      name: {{ required "telegram.secret.name is required with the bot" .Values.telegram.secret.name }}
      key: {{ .Values.telegram.secret.botTokenKey }}
- name: TELEGRAM_BOT_USERNAME
  value: {{ required "telegram.botUsername is required with the bot" .Values.telegram.botUsername | quote }}
{{- with .Values.telegram.teamChatId }}
- name: TELEGRAM_TEAM_CHAT_ID
  value: {{ . | quote }}
{{- end }}
{{- end }}

{{- define "backoffice-api.mailEnv" -}}
- name: SMTP_URL
  valueFrom:
    secretKeyRef:
      name: {{ required "mail.smtpUrlSecret.name is required with mail.from" .Values.mail.smtpUrlSecret.name }}
      key: {{ .Values.mail.smtpUrlSecret.key }}
- name: MAIL_FROM
  value: {{ required "mail.from is required with mail.smtpUrlSecret" .Values.mail.from | quote }}
{{- end }}

{{- /*
A scheduled job from the API's image (ADR-0001, jobs): Europe/Madrid, never two runs at once, its own credentials
only (`env`, rendered YAML), no service-account token, the API's container security, a scratch /tmp.
Arguments: root, component, script, schedule, env, envFrom, resources, activeDeadlineSeconds.
*/}}
{{- define "backoffice-api.cronjob" -}}
{{- $root := .root -}}
apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{ include "backoffice-api.fullname" $root }}-{{ .component }}
  labels:
    {{- include "backoffice-api.labels" $root | nindent 4 }}
    app.kubernetes.io/component: {{ .component }}
spec:
  schedule: {{ .schedule | quote }}
  timeZone: Europe/Madrid
  concurrencyPolicy: Forbid
  # A run missed by more than this (the node was down) waits for the next one.
  startingDeadlineSeconds: 1800
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: {{ .activeDeadlineSeconds | default 600 }}
      template:
        metadata:
          labels:
            {{- include "backoffice-api.jobLabels" (dict "root" $root "component" .component) | nindent 12 }}
          annotations:
            # Velero's file-system backup (gitops backup plan) skips this scratch volume.
            backup.velero.io/backup-volumes-excludes: tmp
        spec:
          restartPolicy: Never
          automountServiceAccountToken: false
          securityContext:
            runAsNonRoot: true
            runAsUser: 1000
            runAsGroup: 1000
            seccompProfile:
              type: RuntimeDefault
          containers:
            - name: {{ .component }}
              image: "{{ $root.Values.image.repository }}:{{ required "image.tag is required" $root.Values.image.tag }}"
              imagePullPolicy: {{ $root.Values.image.pullPolicy }}
              command: ['node', {{ .script | quote }}]
              securityContext:
                {{- toYaml $root.Values.securityContext | nindent 16 }}
              env:
                - name: LOG_LEVEL
                  value: {{ $root.Values.logLevel | quote }}
                {{- .env | nindent 16 }}
              {{- with .envFrom }}
              envFrom:
                {{- toYaml . | nindent 16 }}
              {{- end }}
              resources:
                {{- toYaml .resources | nindent 16 }}
              volumeMounts:
                - name: tmp
                  mountPath: /tmp
          volumes:
            - name: tmp
              emptyDir:
                sizeLimit: 64Mi
{{- end }}

{{- /* DNS, through kube-dns. */}}
{{- define "backoffice-api.dnsEgress" -}}
- to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
      podSelector:
        matchLabels:
          k8s-app: kube-dns
  ports:
    - port: 53
      protocol: UDP
    - port: 53
      protocol: TCP
{{- end }}

{{- /* Mailu's submission inside the cluster, when its namespace is set. The ports are the pods' (a policy sees the
     connection after the Service). */}}
{{- define "backoffice-api.mailEgress" -}}
{{- with .mail }}
{{- if .namespace -}}
- to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: {{ .namespace }}
      podSelector:
        matchLabels:
          {{- toYaml .podLabels | nindent 10 }}
  ports:
    {{- range .ports }}
    - port: {{ . }}
      protocol: TCP
    {{- end }}
{{- end }}
{{- end }}
{{- end }}

{{- /* The public internet on 443 only (Telegram's Bot API, Airtable), never the cluster's or other private ranges. */}}
{{- define "backoffice-api.internetEgress" -}}
- to:
    - ipBlock:
        cidr: 0.0.0.0/0
        except:
          - 0.0.0.0/8
          - 10.0.0.0/8
          - 100.64.0.0/10
          - 127.0.0.0/8
          - 169.254.0.0/16
          - 172.16.0.0/12
          - 192.0.0.0/24
          - 192.0.2.0/24
          - 192.88.99.0/24
          - 192.168.0.0/16
          - 198.18.0.0/15
          - 198.51.100.0/24
          - 203.0.113.0/24
          - 224.0.0.0/4
          - 240.0.0.0/4
    - ipBlock:
        cidr: 2000::/3
        except:
          - 2001::/32
          - 2001:2::/48
          - 2001:10::/28
          - 2001:20::/28
          - 2001:db8::/32
          - 2002::/16
          - 3fff::/20
  ports:
    - port: 443
      protocol: TCP
{{- end }}

{{- /* What the API and its jobs reach: the database, DNS, error tracking when set; with `mail`, Mailu when set; with
     `internet`, the internet on 443. Arguments: policy, mail, internet. */}}
{{- define "backoffice-api.egress" -}}
{{- $policy := .policy -}}
- to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: {{ $policy.database.namespace }}
  ports:
    - port: {{ $policy.database.port }}
      protocol: TCP
{{ include "backoffice-api.dnsEgress" . }}
{{- with $policy.errorTracking }}
{{- if .namespace }}
# Error tracking's in-cluster Service: the port is its pods'.
- to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: {{ .namespace }}
      podSelector:
        matchLabels:
          {{- toYaml .podLabels | nindent 10 }}
  ports:
    - port: {{ .port }}
      protocol: TCP
{{- end }}
{{- end }}
{{- if and .mail $policy.mail.namespace }}
{{ include "backoffice-api.mailEgress" $policy }}
{{- end }}
{{- if .internet }}
{{ include "backoffice-api.internetEgress" . }}
{{- end }}
{{- end }}
