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

type Status =
  { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; text: string } | { kind: 'error'; text: string };

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

  const run = async (job: () => Promise<string>) => {
    setStatus({ kind: 'busy' });
    try {
      setStatus({ kind: 'ok', text: await job() });
    } catch (err) {
      setStatus({ kind: 'error', text: backupErrorMessage(err) });
    }
  };

  const doExport = () =>
    void run(async () => {
      setLast(await exportBackup());
      return t.backup.exported;
    });

  const doImport = () =>
    pickBackupFile(
      (file) =>
        void run(async () => {
          const s = await importBackupFile(file, { settings: withSettings });
          return t.backup.restored(s.songsAdded, s.songsMerged, s.runsAdded);
        }),
    );

  const busy = status.kind === 'busy';
  return (
    <>
      <p className="help">{t.backup.help}</p>
      <div className="backup-actions">
        <button className="btn primary" onClick={doExport} disabled={busy}>
          {t.backup.export}
        </button>
        <button className="btn" onClick={doImport} disabled={busy}>
          {t.backup.import}
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} />
        {t.backup.includeSettings}
      </label>
      <p className="help">{t.backup.mergeHelp}</p>
      <p className="help" role="status">
        {status.kind === 'busy'
          ? t.backup.working
          : status.kind === 'ok'
            ? status.text
            : last
              ? t.backup.last(
                  new Date(last).toLocaleString(t.dateLocale, { dateStyle: 'medium', timeStyle: 'short' }),
                )
              : t.backup.never}
      </p>
      {status.kind === 'error' && (
        <p className="error-text" role="alert">
          {status.text}
        </p>
      )}
      {storage !== 'unsupported' && (
        <p className="help">
          {storage === 'persisted' ? t.backup.persisted : t.backup.transient}{' '}
          {storage === 'transient' && (
            <button className="link" onClick={() => void requestPersistentStorage().then(setStorage)}>
              {t.backup.persist}
            </button>
          )}
        </p>
      )}
    </>
  );
}
