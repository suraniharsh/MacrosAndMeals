# Copilot Instructions for MacrosAndMeals

## Project Overview

MacrosAndMeals is a **diet planning backend API** that helps users create personalized diet plans through a science-based approach. This is a Node.js/Express backend with MySQL database via Prisma ORM, designed to power frontend platforms for weight loss, muscle gain, and healthy eating goals.

## Architecture & Tech Stack

- **Backend**: Node.js with Express.js
- **Database**: MySQL 8.0 with Prisma ORM
- **Authentication**: JWT with bcrypt
- **Validation**: Joi schemas
- **Development**: Docker Compose for local MySQL, nodemon for hot reload

## Key Conventions

### Directory Structure
```
src/
├── app.js           # Express app configuration (currently empty)
├── index.js         # Server entry point
├── config/          # Configuration files
├── controllers/     # Route handlers
├── middleware/      # Express middleware
├── models/          # Prisma models (avoid - use schema.prisma)
├── routes/          # API route definitions
├── services/        # Business logic layer
├── tests/           # Test files
└── utils/           # Helper functions
```

### Prisma Configuration
- **Client output**: Custom path to `../src/generated/prisma` (not default)
- **Database**: MySQL connection via `DATABASE_URL` environment variable
- **Schema**: Located in `prisma/schema.prisma`
- Generated Prisma client is gitignored in `/src/generated/prisma`

### Development Workflow

#### Database Setup
```bash
# Start MySQL container
docker-compose up -d

# Run Prisma migrations
npx prisma migrate dev

# View database with Prisma Studio
npx prisma studio
```

#### Development Commands
```bash
npm run dev        # Start with nodemon (hot reload)
npm start          # Production start
```

### Environment Configuration
- **Database URL**: `mysql://appuser:apppass@localhost:3306/diet_planner`
- **Docker credentials**: `appuser:apppass` (development only)
- **Port**: Defaults to 3000, configurable via `PORT` env var

## Critical Patterns

### Authentication Flow
- Uses JWT tokens with bcrypt for password hashing
- Implement auth middleware in `src/middleware/`
- Store user sessions and handle token validation

### API Structure
- RESTful design following Express.js patterns
- Controllers handle HTTP logic, services contain business logic
- Use Joi for request validation before database operations

### Database Patterns
- **Import Prisma client**: `import { PrismaClient } from './generated/prisma'`
- Prisma client instance should be singleton across the application
- Use Prisma's built-in connection pooling

### Error Handling
- Implement consistent error responses
- Use Express error middleware for centralized error handling
- Return appropriate HTTP status codes for diet planning context

## Development Notes

- The project structure is set up but most implementation files are empty
- Focus on building out the API endpoints for diet planning functionality
- Ensure all database interactions go through Prisma ORM
- The Docker setup is configured for local development with persistent MySQL data

## Common Tasks

When implementing features:
1. Define Prisma models in `schema.prisma` first
2. Generate and run migrations: `npx prisma migrate dev`
3. Create service layer functions for business logic
4. Build controllers that use services and handle HTTP concerns
5. Set up routes that connect to controllers
6. Add validation middleware using Joi schemas

Remember: This is a **backend-only** project focused on API development for diet planning platforms.