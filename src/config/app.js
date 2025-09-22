// Application configuration

export const config = {
  port: process.env.PORT || 3000,
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publicKey: process.env.STRIPE_PUBLIC_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  }
};