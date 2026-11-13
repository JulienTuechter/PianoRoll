import type { MusicalKey } from '../../core/key-detection/key';
import { buildNotation, type NotationScore } from '../../core/notation-builder/notation';
import type { MeasureInfo, TempoMap } from '../../core/note-event-model/tempo-map';
import type { NoteEvent } from '../../core/note-event-model/types';

/** Notenbild-Modell eines Stücks (gemeinsam für Notenansicht, Export und Aufnahme-Vorschau). */
export function scoreFor(
  notes: readonly NoteEvent[],
  measures: readonly MeasureInfo[],
  ppq: number,
  key: MusicalKey | null,
  tempoMap: TempoMap | null,
): NotationScore {
  return buildNotation(notes, measures, ppq, {
    key,
    secToTick: tempoMap ? (sec) => tempoMap.secToTick(sec) : undefined,
  });
}
