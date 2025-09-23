import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { log } from './utils/logger.js';
import { requestLogger, errorLogger } from './middleware/logging.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import trainerRoutes from './routes/trainers.js';
import customerRoutes from './routes/customers.js';
import mealPlanRoutes from './routes/mealplans.js';
import billingRoutes from './routes/billing.js';

const app = express();

// Middleware
app.use(cors());

// Logging middleware (replaces morgan)
app.use(requestLogger);

// Stripe webhook needs raw body, so handle it before JSON parsing
// This must come BEFORE express.json() to preserve raw body for signature verification
app.use('/api/billing/webhook', express.raw({ 
  type: 'application/json',
  limit: '5mb' 
}));

// JSON parsing for all other routes
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trainers', trainerRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/mealplans', mealPlanRoutes);
app.use('/api/billing', billingRoutes);

// Health check
app.get('/health', (req, res) => {
  log.info('Health check requested');
  res.json({ status: 'OK', message: 'Diet Planner API is running' });
});

// Error logging middleware
app.use(errorLogger);

// Global error handler
app.use((error, req, res, next) => {
  const logger = req.logger || log;
  logger.error('Global error handler', { url: req.originalUrl }, error);
  
  res.status(500).json({
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: error.message })
  });
});

export default app;