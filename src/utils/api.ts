// API utility for fetching data from Netlify
const NETLIFY_BASE_URL = 'https://illustrious-cuchufli-7c4e58.netlify.app';

export async function fetchEnglishData() {
  try {
    const response = await fetch(`${NETLIFY_BASE_URL}/english/words_db.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch English data:', error);
    return null;
  }
}

export async function fetchTOEFLData() {
  try {
    const response = await fetch(`${NETLIFY_BASE_URL}/toefl/index.html`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    // Parse TOEFL data from HTML (detailed parsing needed)
    return html;
  } catch (error) {
    console.error('Failed to fetch TOEFL data:', error);
    return null;
  }
}

export async function fetchPapersData() {
  try {
    const response = await fetch(`${NETLIFY_BASE_URL}/paper_search/user_prefs.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch Papers data:', error);
    return null;
  }
}
