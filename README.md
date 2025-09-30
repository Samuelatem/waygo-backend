# WayGo Backend API

🚗 Urban Mobility Platform Backend for Cameroon

## 🚀 Features

- **User Authentication** - JWT-based login/register
- **Role-based Access** - Rider, Driver, Admin roles
- **Ride Management** - Request, accept, track rides
- **Location Services** - Real-time location tracking
- **Payment Integration** - MTN MoMo, Orange Money support
- **Geospatial Queries** - Find nearby drivers

## 📋 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `PUT /api/auth/password` - Change password
- `POST /api/auth/logout` - Logout

### Users
- `GET /api/users` - Get all users (admin)
- `GET /api/users/drivers/nearby` - Find nearby drivers
- `PUT /api/users/location` - Update user location
- `PUT /api/users/driver/availability` - Toggle driver availability
- `PUT /api/users/driver/vehicle` - Update vehicle info
- `POST /api/users/payment-methods` - Add payment method

### Rides
- `POST /api/rides` - Request a ride
- `GET /api/rides` - Get user's rides
- `PUT /api/rides/:id/accept` - Accept ride (driver)

### Payments
- `POST /api/payments/process` - Process payment
- `GET /api/payments/methods` - Get payment methods

## 🛠️ Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **CORS** - Cross-origin requests

## 🚀 Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   # .env file
   PORT=5000
   NODE_ENV=development
   JWT_SECRET=your-secret-key
   MONGODB_URI=mongodb://localhost:27017/waygo
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **API will be available at:**
   ```
   http://localhost:5000
   ```

## 📊 Database Models

### User Model
- Personal info (name, email, phone)
- Role-based access (rider/driver/admin)
- Location tracking
- Vehicle info (for drivers)
- Payment methods
- Preferences

### Ride Model
- Rider and driver references
- Pickup/destination locations
- Fare calculation
- Status tracking
- Payment info
- Ratings

## 🔐 Security Features

- JWT token authentication
- Password hashing with bcrypt
- Role-based authorization
- CORS protection
- Helmet security headers
- Input validation

## 🌍 Localization

- Support for English and French
- Cameroonian phone number validation
- XAF currency support
- Local payment methods (MTN MoMo, Orange Money)

## 📱 Mobile-First Design

- RESTful API design
- JSON responses
- Error handling
- Rate limiting ready
- Scalable architecture

## 🔄 Development

```bash
# Start development server
npm run dev

# Start production server
npm start

# Check for linting issues
npm run lint
```

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment | `development` |
| `JWT_SECRET` | JWT signing secret | Required |
| `MONGODB_URI` | Database connection | `mongodb://localhost:27017/waygo` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |

 
