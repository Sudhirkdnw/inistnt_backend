const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Hykee Enterprise API Documentation',
            version: '1.0.0',
            description: 'API Documentation for Hykee College Confession & Dating Platform.',
            contact: {
                name: 'API Support',
                email: 'support@hykee.in'
            }
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Local Development Server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Enter your JWT token in the format Bearer <token>'
                }
            }
        }
    },
    // Files containing OpenAPI definitions/comments
    apis: ['./src/routes/*.js', './backend/src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

function setupSwagger(app) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    console.log('📖 Swagger API Documentation is available at http://localhost:3000/api-docs');
}

module.exports = setupSwagger;
