const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// SWAGGER CONFIGURATION
// ==========================================
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Resumware API',
      version: '1.0.0',
      description: 'AI-Powered Resume Generator Backend',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Local server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  // Points to files where you wrote the @swagger comments
  apis: ['./routes/*.js'], 
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// ==========================================
// ROUTES
// ==========================================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/resume', require('./routes/resume'));

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'Resume Generator API is running',
    endpoints: {
      auth: '/api/auth',
      resume: '/api/resume',
      swagger: '/api-docs' // Added swagger link
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📖 Swagger docs available at http://localhost:${PORT}/api-docs`);
});