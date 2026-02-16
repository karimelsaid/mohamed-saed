// Debug function to check form validation status
function debugBuyerFormValidation() {
  const user = {
    username: '', // Fill with actual values
    email: '',
    password: '',
    phone: '',
    governorate: '',
    city: '',
    village: ''
  };

  // Check each validation flag
  console.log('=== Buyer Form Validation Debug ===');
  console.log('Username:', user.username, 'Valid:', user.username.trim().length > 0);
  console.log('Email:', user.email, 'Valid:', /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/.test(user.email));
  console.log('Password length:', user.password.length, '>= 6:', user.password.length >= 6);
  console.log('Password valid:', !/\s/.test(user.password) && user.password.length >= 8);
  console.log('Password mismatch:', user.password !== ''); // Check against confirmPassword
  console.log('Phone valid:', /^(010|011|012|015)[0-9]{8}$/.test(user.phone));
  console.log('Governorate:', user.governorate, 'Valid:', !!user.governorate);
  console.log('City:', user.city, 'Valid:', !!user.city);
  
  const isValid = !!(
    user.username.trim() &&
    user.email.trim() &&
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/.test(user.email) &&
    user.password.length >= 6 &&
    !/\s/.test(user.password) &&
    user.password.length >= 8 &&
    /^(010|011|012|015)[0-9]{8}$/.test(user.phone) &&
    user.governorate &&
    user.city
  );
  
  console.log('Overall form valid:', isValid);
  return isValid;
}

// Usage: Call this function in your browser console with actual values
