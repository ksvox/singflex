import { db, SONGS } from '../../../lib/firebaseAdmin';
import { isAdmin } from '../../../lib/pass';

export default async function handler(req, res) {
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'admin' });
  const snap = await db().collection(SONGS).get();
  const songs = snap.docs.map((d) => {
    const s = d.data();
    return {
      id: d.id, title: s.title, ep: s.ep || '', ready: !!s.ready,
      hasVocal: !!s.vocalKey, hasTrack: !!s.trackKey, hasJacket: !!s.jacketKey,
      hasLyrics: !!(s.lines && s.lines.length), timed: !!s.timed, hasChords: !!(s.chords && s.chords.length), hasJp: !!s.jp
    };
  });
  songs.sort((a, b) => a.title.localeCompare(b.title));
  res.json({ songs });
}
