// Validation middleware

export const validateRequest = (schema) => {
  return (req, res, next) => {
    // Joi validation placeholder
    console.log('Request validation middleware called');
    next();
  };
};