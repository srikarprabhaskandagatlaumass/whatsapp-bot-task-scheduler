const cron = require('node-cron');
const fs = require('fs');
const twilio = require('twilio');
require('dotenv').config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Define the people
const people = [
  {name: "Srikar", phone: "whatsapp:+917013231633"},
  {name: "Soorya", phone: "whatsapp:+919121381221"},
  {name: "Tarun", phone: "whatsapp:+14133137092"}
];

// Load and update state
function loadState() {
  return JSON.parse(fs.readFileSync('state.json'));
}

function saveState(state) {
  fs.writeFileSync('state.json', JSON.stringify(state, null, 2));
}

// Send WhatsApp message
function sendMessage(person, task) {
  const message = `Yoo ${person.name}!, clean the ${task} today meh!`;
  client.messages
    .create({
      body: message,
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: person.phone
    })
    .then(msg => console.log(`Sent ${task} reminder to ${person.name}: ${msg.sid}`))
    .catch(err => console.error(err));
}

// Send WhatsApp message with custom message
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

// Rotate tasks and send message for today
function rotateTask(task) {
  let state = loadState();

  if (task === "kitchen") {
    const person = people[state.kitchenIndex];
    sendMessage(person, "kitchen");

    // Update index for kitchen
    state.kitchenIndex = (state.kitchenIndex + 1) % people.length;

    // Avoid collision with bathroom
    if (state.kitchenIndex === state.bathroomIndex) {
      state.kitchenIndex = (state.kitchenIndex + 1) % people.length;
    }
  }

  if (task === "bathroom") {
    const person = people[state.bathroomIndex];
    sendMessage(person, "bathroom");

    // Update index for bathroom
    state.bathroomIndex = (state.bathroomIndex + 1) % people.length;

    // Avoid collision with kitchen
    if (state.bathroomIndex === state.kitchenIndex) {
      state.bathroomIndex = (state.bathroomIndex + 1) % people.length;
    }
  }

  saveState(state);
}

// Send "tomorrow" reminder (does not rotate index)
function sendTomorrowReminder(task) {
  let state = loadState();

  if (task === "kitchen") {
    const person = people[state.kitchenIndex];
    const message = `Yoo ${person.name}!, you need to clean the kitchen tomorrow meh!`;
    sendCustomMessage(person, message);
  }

  if (task === "bathroom") {
    const person = people[state.bathroomIndex];
    const message = `Yoo ${person.name}!, you need to clean the bathroom tomorrow meh!`;
    sendCustomMessage(person, message);
  }
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
  let idx = (prevBathroomIndex + 1) % people.length;
  if (idx === kitchenIndex) {
    idx = (idx + 1) % people.length;
  }
  return idx;
}

// Enhanced rotateTask for biweekly bathroom and kitchen-bathroom collision avoidance
function enhancedRotateTasks() {
  let state = loadState();

  // Rotate kitchen every week
  state.kitchenIndex = (state.kitchenIndex + 1) % people.length;

  // Bathroom: Only rotate and send on bathroom week
  if (state.bathroomWeek === undefined) state.bathroomWeek = 0; // initialize if missing

  if (state.bathroomWeek === 0) {
    // Rotate bathroom, ensure not same as kitchen
    state.bathroomIndex = getNextBathroomIndex(state.kitchenIndex, state.bathroomIndex ?? 0);
  }

  // Toggle bathroom week (0 -> 1, 1 -> 0)
  state.bathroomWeek = (state.bathroomWeek + 1) % 2;

  saveState(state);
}

// Enhanced reminders for biweekly bathroom
function enhancedSendReminders(day) {
  let state = loadState();

  // Kitchen: always send
  const kitchenPerson = people[state.kitchenIndex];
  let kitchenMsg = day === 'tomorrow'
    ? `Yoo ${kitchenPerson.name}!, you need to clean the kitchen tomorrow meh!`
    : `Yoo ${kitchenPerson.name}!, clean the kitchen today meh!`;
  sendCustomMessage(kitchenPerson, kitchenMsg);

  // Bathroom: only send on bathroom week
  if (state.bathroomWeek === 0) {
    const bathroomPerson = people[state.bathroomIndex];
    let bathroomMsg = day === 'tomorrow'
      ? `Yoo ${bathroomPerson.name}!, you need to clean the bathroom tomorrow meh!`
      : `Yoo ${bathroomPerson.name}!, clean the bathroom today meh!`;
    sendCustomMessage(bathroomPerson, bathroomMsg);
  }
}

// Schedule tasks
function scheduleReminders() {
  // Tomorrow reminder (Friday 10:00 AM)
  cron.schedule('0 10 * * 5', () => {
    enhancedSendReminders('tomorrow');
  });

  // Clean today reminder (Saturday 10:00 AM)
  cron.schedule('0 10 * * 6', () => {
    enhancedSendReminders('today');
  });

  // Clean today reminder (Sunday 10:00 AM)
  cron.schedule('0 10 * * 0', () => {
    enhancedSendReminders('today');
    // Rotate after Sunday cleaning
    enhancedRotateTasks();
  });

  // Rent reminder (4th of every month at 9:00 PM)
  cron.schedule('0 21 4 * *', () => {
    sendRentReminder();
  });

  console.log("Scheduling started: Kitchen (weekly), Bathroom (biweekly), with Friday reminders and monthly rent reminder");
}

// Helper to send "clean today" message without rotating
// function sendTodayReminder(task) {
//   let state = loadState();
//   let person;
//   if (task === "kitchen") {
//     person = people[state.kitchenIndex];
//     sendCustomMessage(person, `Yoo ${person.name}!, clean the kitchen today meh!`);
//   }
//   if (task === "bathroom") {
//     person = people[state.bathroomIndex];
//     sendCustomMessage(person, `Yoo ${person.name}!, clean the bathroom today meh!`);
//   }
// }

module.exports = {
  scheduleReminders,
  rotateTask
};
