const express = require('express');
const app = express();
// const scheduleReminders = require('./scheduler');
const { scheduleReminders, rotateTask } = require('./scheduler');

app.use(express.json());
app.get('/', (req, res) => res.send('WhatsApp Cleaning Bot Running...'));

// scheduleReminders();
rotateTask("kitchen");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot server running on port ${PORT}`));
