# Receipts

Receipts are the PDFs and photos attached to the books' entries ([ADR-0006](../adr/0006-accounting.md) decision 7).
Each file sits on the API's persistent volume, encrypted with `RECEIPTS_KEY` and named by its receipt's id. Its row
is in Postgres, under RLS. The API serves a file only after reading that row as the person asking. This runbook is for
whoever runs the cluster (Dani): turning receipts on, backing them up, restoring them, and the files set aside.

## What there is

| Where                              | What                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `RECEIPTS_ROOT/receipts/<id>`      | A receipt's file: `BKR1`, the nonce, the GCM tag, the ciphertext                   |
| `RECEIPTS_ROOT/orphans/<id>`       | Files set aside: no receipt has their id. Never served, never deleted by the API   |
| `RECEIPTS_ROOT/tmp/`               | Writes in progress; any older than an hour is deleted when the API starts          |
| `app.receipts`                     | Each receipt's row: entry, file name, type, size, SHA-256 of the bytes as uploaded |
| `backoffice-receipts-key` (gitops) | The sealed `RECEIPTS_KEY`: 32 random bytes. **Without it, no receipt opens**       |

## Turning them on (M6)

1. **The key:** `scripts/seal-receipts-key.sh "$GITOPS"` generates the key and seals it as `backoffice-receipts-key`.
   It is never printed and can't be rotated: a new key opens none of the stored receipts.
2. **The values**, under `backoffice-api:` in the backoffice's values file:

   ```yaml
   receipts:
     enabled: true
     size: 2Gi # receipts are small: a few hundred a year
     storageClass: <the cluster's class>
     annotations: {} # what that class's provisioner reads on a claim, if anything
     keySecret: { name: backoffice-receipts-key }
   ```

   The API then deploys with the `Recreate` strategy: the claim is ReadWriteOnce, so the old pod lets go of it before
   the new one starts, a gap of a few seconds at each deploy. The chart refuses more than one replica.

3. **The backup plan** (gitops) must copy the volume, with the database, and keep the key (below).
4. **Push gitops.** Check the API's logs at start: `Receipts volume writable`, then `Receipts volume checked` with
   `setAside: 0`. In the staff app, tesorería attaches a fictional PDF to an entry. An admin downloads it, and gets the
   same file. On the volume, the file is named by a uuid and its content is unreadable.

## Backups

- **The order:** each copy of the volume is taken after the database dump it goes with. A file is written before its
  row, so every row in a dump names a file that was already on the volume when the dump was taken. A volume copy taken
  after the dump has all of them. Files the copy has and the dump doesn't are set aside when restored (below).
- **The key:** the sealed secret in gitops opens only with the cluster's sealing key. Keep a copy of `RECEIPTS_KEY`
  outside the cluster as well, where the association keeps its credentials:
  `kubectl -n <namespace> get secret backoffice-receipts-key -o jsonpath='{.data.RECEIPTS_KEY}' | base64 -d` prints
  it once. Paste it there and nowhere else: not a chat, a ticket or this repository.
- What the law asks to keep (personal data spec §9a): the books and their receipts for at least four years after
  each year closes, six as usual practice. Copies older than what the association keeps can expire.

## Restoring

1. Restore the database dump and the volume copy taken after it, together; or only the database, onto the live
   volume.
2. Start the API. As it starts, it asks the database which files have no row (`private.receipts_without_row`, ids
   in, ids out). Files without a row move to `orphans/`. Files in `orphans/` whose row is back move to `receipts/`.
   The log line `Receipts volume checked` says how many of each.
3. A row whose file is missing answers 404 in the staff app. It means the volume copy is older than the dump: restore
   a later copy of the volume, and the API puts the files in place at its next start.

Restoring the wrong dump, then the right one, loses nothing: the receipts the first set aside come back with the
second. This is why files are set aside rather than deleted (Dani, 2026-10-30).

## Files set aside

`orphans/` grows only after a crash between a file's write and its row's commit (rare), or after a restore. To see
what's there, in the API's pod:

```sh
ls -l /data/receipts/orphans
```

Before deleting them for good, make sure no backup that could still be restored names them, which means a dump taken
after the file was written. When unsure, leave them: they are encrypted, and small. To delete one:
`rm /data/receipts/orphans/<id>`.

## A lost key

Every receipt is lost: no one can open the files any more. The rows and the books stay as they are, and a download
answers an error. Seal a new key (delete the sealed file, run the script, push), then attach the receipts again from
wherever they still are: the bank, the supplier, the email that brought them. A posted entry's old receipts can't be
removed, so the new copies sit beside them.
