const Joi = require('joi');

const validationSchemas = {
    speedTest: Joi.object({
        duration: Joi.number().min(5).max(300).required(),
        frequency: Joi.number().min(0.1).max(10).required()
    }),

    signalMonitoring: Joi.object({
        interval: Joi.number().min(1).max(60).required(),
        threshold: Joi.number().min(-120).max(-30).required(),
        duration: Joi.number().min(10).max(3600).optional()
    }),

    coverageMapping: Joi.object({
        bounds: Joi.string().pattern(/^-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*$/).required(),
        density: Joi.string().valid('low', 'medium', 'high').required()
    }),

    roamingTest: Joi.object({
        sourceNetwork: Joi.string().required(),
        targetRegions: Joi.string().required()
    }),

    apiTest: Joi.object({
        endpoint: Joi.string().uri().required(),
        method: Joi.string().valid('GET', 'POST', 'PUT', 'DELETE').required(),
        headers: Joi.object().optional(),
        body: Joi.any().optional(),
        timeout: Joi.number().min(1000).max(60000).optional()
    })
};

const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                error: 'Validation error',
                message: error.details[0].message,
                details: error.details
            });
        }
        
        next();
    };
};

module.exports = {
    validate,
    schemas: validationSchemas
};
