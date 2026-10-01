async function getProgression(db, userId) {
  var progression = await db.chordProgression.findUnique({
    where: { UserId: userId },
    include: { Chords: { orderBy: { Position: 'asc' } } },
  });
  if (!progression) return null;
  return {
    key: progression.KeyName,
    tonality: progression.Tonality,
    progression: progression.Chords.map(function (chord) {
      return { id: chord.ProgressionChordId, degree: chord.Degree };
    }),
  };
}

async function hasProgression(db, userId) {
  return (await db.chordProgression.count({ where: { UserId: userId } })) > 0;
}

// Call inside a transaction: the upsert, delete and insert must land together.
async function replaceProgression(db, userId, input) {
  await db.chordProgression.upsert({
    where: { UserId: userId },
    create: { UserId: userId, KeyName: input.key, Tonality: input.tonality },
    update: { KeyName: input.key, Tonality: input.tonality },
  });
  await db.progressionChord.deleteMany({ where: { UserId: userId } });
  if (input.progression.length > 0) {
    await db.progressionChord.createMany({
      data: input.progression.map(function (chord, index) {
        return { UserId: userId, Position: index, Degree: chord.degree };
      }),
    });
  }
}

module.exports = { getProgression, hasProgression, replaceProgression };
