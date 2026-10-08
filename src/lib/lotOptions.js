export const COUNTRY_OPTIONS = [
  'Brazil', 'Colombia', 'Ethiopia', 'Burundi', 'India', 'Mexico', 'Uganda', 'Ecuador',
  'El Salvador', 'Guatemala', 'Honduras', 'Kenya', 'Peru', 'Rwanda', 'Tanzania',
  'Venezuela', 'Vietnam', 'Yemen'
].sort((a, b) => a.localeCompare(b, 'en')).concat('Other');

// Match the Sample Type validation choices in Cupping Lab Data.
export const SAMPLE_TYPE_OPTIONS = ['Offer', 'Pre-Milling', 'PSS', 'Arrival', 'Spot', 'Type', 'Other'];
