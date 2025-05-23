const cron = require('node-cron');
const fs = require('fs');
const twilio = require('twilio');
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const people = [
  {name: "Srikar", phone: "whatsapp:+917013231633"},
  {name: "Soorya", phone: "whatsapp:+919121381221"},
  {name: "Tarun", phone: "whatsapp:+14133137092"}
];

function loadState() {
  return JSON.parse(fs.readFileSync('state.json'));
}

function saveState(state) {
  fs.writeFileSync('state.json', JSON.stringify(state, null, 2));
}

function sendCustomMessage(person, message) {
  client.messages
    .create({
      body: message,
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: person.phone
    })
    .then(msg => console.log(`Sent reminder to ${person.name}: ${msg.sid}`))
    .catch(err => console.error(err));
}

// Send rent reminder to all members
function sendRentReminder() {
  people.forEach(person => {
    const message = `Yoo ${person.name}, pay the rent and utilities this month meh!`;
    sendCustomMessage(person, message);
  });
}

// Helper: Get next eligible bathroom index (not same as kitchen)
function getNextBathroomIndex(kitchenIndex, prevBathroomIndex) {
  for (let i = 1; i <= people.length; i++) {
    let idx = (prevBathroomIndex + i) % people.length;
    if (idx !== kitchenIndex) return idx;
  }
  return (kitchenIndex + 1) % people.length;
}

// Enhanced rotateTask for biweekly bathroom and kitchen-bathroom collision avoidance
function enhancedRotateTasks() {
  let state = loadState();
  state.kitchenIndex = (state.kitchenIndex + 1) % people.length;
  if (state.bathroomWeek === undefined) state.bathroomWeek = 0; 
  if (state.bathroomWeek === 0) {
    state.bathroomIndex = getNextBathroomIndex(state.kitchenIndex, state.bathroomIndex ?? 0);
  }

  state.bathroomWeek = (state.bathroomWeek + 1) % 2;
  state.done = { kitchen: false, bathroom: false };
  saveState(state);
}

// Enhanced reminders for biweekly bathroom
function enhancedSendReminders(day) {
  let state = loadState();

  if (!state.done) state.done = { kitchen: false, bathroom: false };

  if (!(day === 'today' && state.done.kitchen)) {
    const kitchenPerson = people[state.kitchenIndex];
    let kitchenMsg = day === 'tomorrow'
      ? `Yoo ${kitchenPerson.name}!, you need to clean the kitchen tomorrow meh!`
      : `Yoo ${kitchenPerson.name}!, clean the kitchen today meh!`;
    sendCustomMessage(kitchenPerson, kitchenMsg);
  }

  if (state.bathroomWeek === 0 && !(day === 'today' && state.done.bathroom)) {
    const bathroomPerson = people[state.bathroomIndex];
    let bathroomMsg = day === 'tomorrow'
      ? `Yoo ${bathroomPerson.name}!, you need to clean the bathroom tomorrow meh!`
      : `Yoo ${bathroomPerson.name}!, clean the bathroom today meh!`;
    sendCustomMessage(bathroomPerson, bathroomMsg);
  }
}

// Schedule tasks
function scheduleReminders() {
  cron.schedule('0 10 * * 5', () => { // (Friday 10:00 AM)
    enhancedSendReminders('tomorrow');
  });

  cron.schedule('0 10 * * 6', () => { // (Saturday 10:00 AM)
    enhancedSendReminders('today');
  });

  cron.schedule('0 10 * * 0', () => { // (Sunday 10:00 AM)
    enhancedSendReminders('today');
    enhancedRotateTasks(); // Rotate after Sunday cleaning
  });

  cron.schedule('0 21 4 * *', () => { // (4th of every month at 9:00 PM)
    sendRentReminder();
  });

  console.log("Scheduling started: Kitchen (weekly), Bathroom (biweekly), with Friday reminders and monthly rent reminder");
}

function startBotServer() {
  const app = express();
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(express.json());

  app.post('/whatsapp-webhook', (req, res) => {
    const incomingMsg = req.body.Body && req.body.Body.trim().toLowerCase();
    const from = req.body.From;

    let state = loadState();

    const kitchenPerson = state.kitchenIndex !== undefined ? state.kitchenIndex : 0;
    const bathroomPerson = state.bathroomIndex !== undefined ? state.bathroomIndex : 1;

    if (!state.done) state.done = { kitchen: false, bathroom: false };

    let thankYouTask = null;

    if (incomingMsg === 'done') {
      if (from.endsWith(people[kitchenPerson].phone.replace('whatsapp:', ''))) {
        state.done.kitchen = true;
        thankYouTask = 'kitchen';
      }
      if (state.bathroomWeek === 0 && from.endsWith(people[bathroomPerson].phone.replace('whatsapp:', ''))) {
        state.done.bathroom = true;
        thankYouTask = 'bathroom';
      }
      saveState(state);
    }

    if (thankYouTask) {
      client.messages.create({
        body: `Thank you for cleaning ${thankYouTask}.`,
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: from
      }).catch(err => console.error(err));
    }

    res.sendStatus(200);
  });

  // Optional: Health check endpoint
  app.get('/', (req, res) => res.send('WhatsApp Cleaning Bot Running.'));

  scheduleReminders();

  const PORT = process.env.PORT || 7777;
  app.listen(PORT, () => console.log(`Server running on ${PORT}`));
}

// Main execution
startBotServer();