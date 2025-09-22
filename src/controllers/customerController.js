// Customer self-service controller
// Business rules:
// - CUSTOMER has read-only diet/meal plan access

export const customerController = {
  getProfile: (req, res) => {
    res.json({ message: 'getProfile placeholder' });
  },

  updateProfile: (req, res) => {
    res.json({ message: 'updateProfile placeholder' });
  },

  getMealPlans: (req, res) => {
    res.json({ message: 'getMealPlans placeholder' });
  },

  getProgress: (req, res) => {
    res.json({ message: 'getProgress placeholder' });
  }
};