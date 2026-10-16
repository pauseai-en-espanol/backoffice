# shellcheck shell=bash
# The deploy scripts' cluster-specific settings (seal-*.sh). This repository is public, so they live in the private
# gitops repository, in <path-to-gitops>/backoffice-deploy.env, never here (CLAUDE.md);
# scripts/deploy-settings.example.env lists them, with fictional values. None is a secret.
#
# The file is read, not sourced: one KEY=value per line, `#` comments, the value taken literally (a robot's `$` stays a
# `$`), surrounding quotes dropped. Only the names below are read, and only from the file: the environment is ignored,
# since names as plain as NAMESPACE or DB_HOST are easily set there for something else. A dry run points a script at a
# scratch directory with its own settings file (KUBESEAL_ARGS=--cert <throwaway certificate>).

DEPLOY_SETTINGS_FILE=backoffice-deploy.env
DEPLOY_SETTINGS=(APP_DIR VALUES_FILE PG_DIR PG_NAMESPACE NAMESPACE KUBESEAL_ARGS HARBOR_URL HARBOR_ROBOT
  HARBOR_REPOSITORY DB_HOST GLITCHTIP_HOST SMTP_HOST SMTP_PORT TLS_SERVERNAME)

# load_deploy_settings <path-to-gitops> <required name>...: reads the settings file, then fails naming every required
# setting it leaves unset. Defaults for the optional ones are the calling script's.
load_deploy_settings() {
  local gitops="$1" file="$1/$DEPLOY_SETTINGS_FILE" line key value name known missing=()
  shift
  [ -d "$gitops" ] || { echo "Not a directory: $gitops" >&2; exit 1; }
  unset "${DEPLOY_SETTINGS[@]}"
  if [ -f "$file" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line%$'\r'}"
      case "$line" in '' | '#'*) continue ;; esac
      key="${line%%=*}"
      if [ "$key" = "$line" ]; then
        echo "$file: not a KEY=value line: $line" >&2
        exit 1
      fi
      value="${line#*=}"
      case "$value" in
        \"*\") value="${value#\"}" && value="${value%\"}" ;;
        \'*\') value="${value#\'}" && value="${value%\'}" ;;
      esac
      known=''
      for name in "${DEPLOY_SETTINGS[@]}"; do
        if [ "$name" = "$key" ]; then
          known=1
        fi
      done
      if [ -z "$known" ]; then
        echo "$file: unknown setting $key (see scripts/deploy-settings.example.env)" >&2
        exit 1
      fi
      printf -v "$key" '%s' "$value"
    done <"$file"
  fi
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      missing+=("$name")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "Missing deploy settings: ${missing[*]}. Set them in $file" >&2
    echo "(scripts/deploy-settings.example.env lists them all)." >&2
    exit 1
  fi
}
