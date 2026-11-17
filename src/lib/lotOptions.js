export const COUNTRY_OPTIONS = [
  'Brazil', 'Colombia', 'Ethiopia', 'Burundi', 'India', 'Mexico', 'Uganda', 'Ecuador',
  'El Salvador', 'Guatemala', 'Honduras', 'Kenya', 'Peru', 'Rwanda', 'Tanzania',
  'Venezuela', 'Vietnam', 'Yemen'
].sort((a, b) => a.localeCompare(b, 'en')).concat('Other');

// Match the Sample Type choices in the AirTable Master Sheet (see server/google-apps-script.gs
// lookupSample_), so suggestions line up with what a Sample ID lookup can actually fill in.
export const SAMPLE_TYPE_OPTIONS = ['Type', 'Offer', 'PSS', 'Arrival', 'Spot', 'Frozen - Spot', 'Client', 'Cacao', 'Other'];
