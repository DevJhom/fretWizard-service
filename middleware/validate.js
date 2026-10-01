function validate(schemas) {
  return function (req, res, next) {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = validate;
