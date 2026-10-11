var { toFretboardData, toStackRows } = require('../mappers/fretboard');
var { notFound, limitExceeded } = require('../lib/errors');
var { MAX_CARDS } = require('../lib/limits');

var includeFretboards = { Fretboards: { orderBy: { Position: 'asc' } } };

function toCardResponse(card) {
  return {
    id: card.CardId,
    name: card.Name,
    setup: card.Setup,
    fretboards: card.Fretboards.map(function (row) {
      return toFretboardData(row, card.Setup);
    }),
    isFavorite: card.IsFavorite,
    createdAt: card.CreatedDate.getTime(),
  };
}

async function listCards(db, userId) {
  var cards = await db.libraryCard.findMany({
    where: { UserId: userId },
    orderBy: [{ CreatedDate: 'asc' }, { CardId: 'asc' }],
    include: includeFretboards,
  });
  return cards.map(toCardResponse);
}

async function assertCardCapacity(db, userId, adding) {
  var count = await db.libraryCard.count({ where: { UserId: userId } });
  if (count + adding > MAX_CARDS) {
    throw limitExceeded('A library can hold at most ' + MAX_CARDS + ' cards');
  }
}

// createdDate is passed explicitly so cards created in one import keep their order.
async function createCard(db, userId, input, createdDate) {
  var card = await db.libraryCard.create({
    data: {
      UserId: userId,
      Name: input.name,
      Setup: input.setup,
      IsFavorite: input.isFavorite === true,
      CreatedDate: createdDate || new Date(),
      Fretboards: { create: toStackRows(input.fretboards) },
    },
    include: includeFretboards,
  });
  return toCardResponse(card);
}

async function updateCard(prisma, userId, cardId, patch) {
  return prisma.$transaction(async function (tx) {
    var owned = await tx.libraryCard.count({ where: { CardId: cardId, UserId: userId } });
    if (owned === 0) throw notFound('Card not found');

    var data = {};
    if (patch.name !== undefined) data.Name = patch.name;
    if (patch.isFavorite !== undefined) data.IsFavorite = patch.isFavorite;
    if (patch.fretboards !== undefined) {
      await tx.cardFretboard.deleteMany({ where: { CardId: cardId } });
      data.Fretboards = { create: toStackRows(patch.fretboards) };
    }
    var card = await tx.libraryCard.update({ where: { CardId: cardId }, data: data, include: includeFretboards });
    return toCardResponse(card);
  });
}

async function deleteCard(db, userId, cardId) {
  var result = await db.libraryCard.deleteMany({ where: { CardId: cardId, UserId: userId } });
  if (result.count === 0) throw notFound('Card not found');
}

module.exports = { listCards, assertCardCapacity, createCard, updateCard, deleteCard };
