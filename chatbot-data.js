/* ============================================
   LifeDrop — FAQ chatbot
   Simple keyword-matched Q&A, no external API needed.
   ============================================ */

const LifeDropChatbot = (() => {
  const FAQ = [
    {
      keywords: ['how often', 'wait', 'frequency', '56', 'weeks', 'again'],
      question: 'How often can I donate?',
      answer: 'Whole blood donors can typically give again after 56 days (8 weeks). Platelet donors can often donate more frequently — every 7 days, up to 24 times a year.',
    },
    {
      keywords: ['eligib', 'who can donate', 'qualify', 'am i able'],
      question: 'Am I eligible to donate?',
      answer: 'Most healthy adults 17+ (16 with parental consent in some regions), weighing at least 50kg (110lbs), can donate. You\'ll be screened for hemoglobin levels, recent illness, travel history, and medications before every donation.',
    },
    {
      keywords: ['pain', 'hurt', 'safe', 'side effect', 'risk'],
      question: 'Does donating hurt? Is it safe?',
      answer: 'There\'s a brief pinch when the needle is inserted, then little to no discomfort. All equipment is sterile and used once. Most people feel completely normal within a day — just stay hydrated and skip heavy exercise for 24 hours.',
    },
    {
      keywords: ['how long', 'take', 'duration', 'time'],
      question: 'How long does a donation take?',
      answer: 'The actual blood draw takes about 8–10 minutes. With registration, a mini health check, and rest afterward, plan for 45 minutes to an hour total.',
    },
    {
      keywords: ['blood type', 'o negative', 'o-', 'universal', 'ab+', 'compatib'],
      question: 'What do the blood types mean?',
      answer: 'O− is the "universal donor" — safe for any patient in an emergency. AB+ is the "universal recipient" — can receive any blood type. Otherwise, compatibility depends on matching type and Rh factor, which our system checks automatically.',
    },
    {
      keywords: ['sign up', 'register', 'account', 'create account'],
      question: 'How do I create an account?',
      answer: 'Click "Sign in" in the top right, then switch to the "Create account" tab. You\'ll pick a password — we\'ll show you a strength meter as you type to help make it secure.',
    },
    {
      keywords: ['forgot', 'password', 'reset', 'locked out'],
      question: 'I forgot my password / got locked out',
      answer: 'After 5 incorrect attempts, an account is temporarily locked for 2 minutes for security. There\'s currently no password-reset flow in this demo — try again after the lockout expires, or create a new account.',
    },
    {
      keywords: ['donor history', 'my donations', 'record', 'track'],
      question: 'Where can I see my donation history?',
      answer: 'Head to the "Donor History" page from the main menu — every logged donation, including date, blood type, and location, is listed there and stays saved in your browser.',
    },
    {
      keywords: ['patient', 'need blood', 'request', 'urgent', 'critical'],
      question: 'How do I request blood for a patient?',
      answer: 'Go to the "Patients" page and fill out the registration form — include blood type, units needed, and urgency level. Mark it "Critical" if it\'s time-sensitive, and always call emergency services first for a real emergency.',
    },
    {
      keywords: ['admin', 'hospital', 'dashboard', 'management'],
      question: 'What does the Admin dashboard show?',
      answer: 'The Admin page gives hospital staff a live overview: total donations, open patient needs by urgency, and blood type supply levels across the network. It requires an admin account to view.',
    },
    {
      keywords: ['dark mode', 'light mode', 'theme'],
      question: 'How do I switch dark/light mode?',
      answer: 'Click the sun/moon icon in the top navigation bar — your choice is remembered next time you visit.',
    },
    {
      keywords: ['contact', 'phone', 'call', 'email us'],
      question: 'How do I contact LifeDrop?',
      answer: 'Visit the "Contact" page for our phone number, email, and a message form — or for a true emergency, use local emergency services directly.',
    },
  ];

  const FALLBACK = "I'm not sure about that one — try asking about eligibility, donation frequency, blood types, or how to use a specific page. You can also visit the Contact page to reach a real person.";

  const SUGGESTED_STARTERS = [
    'Am I eligible to donate?',
    'How often can I donate?',
    'What blood type is universal?',
    'Does it hurt?',
  ];

  function findAnswer(userText) {
    const text = userText.toLowerCase();
    for (const entry of FAQ) {
      if (entry.keywords.some((kw) => text.includes(kw))) {
        return entry.answer;
      }
    }
    return FALLBACK;
  }

  return { findAnswer, SUGGESTED_STARTERS, FAQ };
})();
