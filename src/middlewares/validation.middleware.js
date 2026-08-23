/**
 * Zod Request Validation Middleware
 * Validates request body, query, or params using a Zod schema.
 * 
 * @param {object} schemas - Object containing Zod schemas for body, query, or params
 */
const validate = (schemas) => {
    return (req, res, next) => {
        try {
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            if (schemas.query) {
                req.query = schemas.query.parse(req.query);
            }
            if (schemas.params) {
                req.params = schemas.params.parse(req.params);
            }
            next();
        } catch (error) {
            if (error.name === "ZodError") {
                const formattedErrors = error.issues.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));

                const primaryMessage = formattedErrors.map(e => e.message).filter(Boolean).join(', ') || "Validation failed";

                return res.status(400).json({
                    message: primaryMessage,
                    errors: formattedErrors
                });
            }
            return res.status(500).json({ message: error.message });
        }
    };
};

module.exports = validate;
