import { useEffect, useState } from 'react';
import {
  backupErrorMessage,
  exportBackup,
  importBackupFile,
  lastBackupAt,
  pickBackupFile,
  requestPersistentStorage,
  storageState,
  type StorageState,
} from '../backup';
import { useT } from '../i18n';

type Action = 'export' | 'import';
type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; action: Action }
  | { kind: 'ok'; action: Action; text: string }
  | { kind: 'error'; action: Action; text: string };

/** Export/Import der Sicherungsdatei und Hinweis zum dauerhaften Speicher (in den Einstellungen). */
export function BackupPanel() {
  const t = useT();
  const [last, setLast] = useState<number | null>(null);
  const [withSettings, setWithSettings] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [storage, setStorage] = useState<StorageState>('unsupported');

  useEffect(() => {
    void lastBackupAt()
      .then(setLast)
      .catch(() => undefined);
    void storageState().then(setStorage);
  }, []);

  const run = async (action: Action, job: () => Promise<string>) => {
    setStatus({ kind: 'busy', action });
    try {
      setStatus({ kind: 'ok', action, text: await job() });
    } catch (err) {
      setStatus({ kind: 'error', action, text: backupErrorMessage(err) });
    }
  };

  const doExport = () =>
    void run('export', async () => {
      setLast(await exportBackup());
      return t.backup.exported;
    });

  const doImport = () =>
    pickBackupFile(
      (file) =>
        void run('import', async () => {
          const s = await importBackupFile(file, { settings: withSettings });
          return t.backup.restored(s.songsAdded, s.songsMerged, s.runsAdded);
        }),
    );

  const busy = status.kind === 'busy';
  const lastText = last
    ? new Date(last).toLocaleString(t.dateLocale, { dateStyle: 'medium', timeStyle: 'short' })
    : t.backup.never;
  // Rückmeldung direkt unter der Aktion, die sie ausgelöst hat
  const feedback = (action: Action) =>
    status.kind !== 'idle' && status.action === action ? (
      status.kind === 'error' ? (
        <p className="error-text" role="alert">
          {status.text}
        </p>
      ) : (
        <p className="backup-status" role="status">
          {status.kind === 'busy' ? t.backup.working : status.text}
        </p>
      )
    ) : null;

  return (
    <>
      <p className="help">{t.backup.help}</p>
      <div className="backup-well">
        <div className="backup-row">
          <div className="backup-fact">
            <span className="backup-label">{t.backup.lastLabel}</span>
            <span className={last ? 'backup-date' : 'backup-date none'}>{lastText}</span>
          </div>
          <button type="button" className="btn" onClick={doExport} disabled={busy}>
            {t.backup.export}
          </button>
        </div>
        {feedback('export')}
        <div className="backup-row backup-restore">
          <label className="check">
            <input
              type="checkbox"
              checked={withSettings}
              onChange={(e) => setWithSettings(e.target.checked)}
            />
            {t.backup.includeSettings}
          </label>
          <button type="button" className="btn" onClick={doImport} disabled={busy}>
            {t.backup.import}
          </button>
        </div>
        <p className="help">{t.backup.mergeHelp}</p>
        {feedback('import')}
      </div>
      {storage !== 'unsupported' && (
        <div className="backup-storage">
          <p className="help">{storage === 'persisted' ? t.backup.persisted : t.backup.transient}</p>
          {storage === 'transient' && (
            <button
              type="button"
              className="btn small"
              onClick={() => void requestPersistentStorage().then(setStorage)}
            >
              {t.backup.persist}
            </button>
          )}
        </div>
      )}
    </>
  );
}
