var { z } = require('zod');
var { stackSchema } = require('./fretboard');

var workspaceSchema = z.object({ fretboards: stackSchema });

module.exports = { workspaceSchema };
