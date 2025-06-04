const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mysql = require('mysql2/promise');

// MySQL connection setup
const connectionString = {
    host: 'localhost',
    user: 'root',
    password: 'aliqaiser1123',
    database: 'clinic_management_system'
};

let db;

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "clinic-bot",
        dataPath: "./session-data"
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    },
    takeoverOnConflict: true,
    restartOnAuthFail: true
});

// Connect to DB
async function connectDB() {
    try {
        db = await mysql.createConnection(connectionString);
        console.log('✅ Connected to MySQL database');
    } catch (err) {
        console.error('❌ Failed to connect to database:', err);
        process.exit(1);
    }
}

// Initialize WhatsApp
async function initializeWhatsApp(retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await client.initialize();
            return true;
        } catch (err) {
            console.error(`❌ Initialization attempt ${i + 1}/${retries} failed:`, err.message);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
            }
        }
    }
    return false;
}

// QR Code
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp bot is ready!');
});

client.on('disconnected', async (reason) => {
    console.log('⚠️ Client disconnected:', reason);
    console.log('⏳ Attempting to reconnect...');
    await initializeWhatsApp();
});

client.on('auth_failure', msg => {
    console.error('❌ Authentication failure:', msg);
});

// State Tracking
const userStates = {};

function resetState(userId) {
    delete userStates[userId];
}

async function safeReply(message, text, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await message.reply(text);
            return true;
        } catch (err) {
            console.error(`⚠️ Attempt ${attempt}/${maxRetries} failed:`, err.message);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    return false;
}

setInterval(() => {
    const now = Date.now();
    for (const [userId, state] of Object.entries(userStates)) {
        if (now - (state.lastActivity || 0) > 86400000) {
            resetState(userId);
            console.log(`♻️ Cleared stale state for ${userId}`);
        }
    }
}, 3600000);

// MAIN MESSAGE HANDLER
client.on('message', async message => {
    const userId = message.from;
    const currentState = userStates[userId] || { step: 0 };

    currentState.lastActivity = Date.now();
    userStates[userId] = currentState;

    try {
        console.log(`📩 ${userId} [Step ${currentState.step}]: ${message.body}`);

        if (/^(hi|hello|start|book appointment)$/i.test(message.body)) {
            userStates[userId] = { step: 1, lastActivity: Date.now() };
            await safeReply(message, 'Welcome to Clinic Bot!\n\nPlease enter your *full name*:');
            return;
        }

        if (/^(1|info|information)$/i.test(message.body)) {
            await safeReply(message, '🏥 *Clinic Information*\n\n• Open: Mon-Sat 9AM-5PM\n• Phone: 1234567890\n• Address: 123 Medical Street');
            return;
        }

        switch (currentState.step) {
            case 1:
                currentState.patientData = { fullName: message.body.trim() };
                currentState.step = 2;
                await safeReply(message, '🚻 Please enter your *Gender* (Male/Female):');
                break;

            case 2:
                const gender = message.body.trim().toLowerCase();
                if (!['male', 'female'].includes(gender)) {
                    await safeReply(message, '❌ Invalid gender. Please enter Male or Female:');
                    return;
                }
                currentState.patientData.gender = gender.charAt(0).toUpperCase() + gender.slice(1);
                currentState.step = 3;
                await safeReply(message, '📞 Enter your *Phone Number*:');
                break;

            case 3:
                currentState.patientData.phone = message.body.trim();
                currentState.step = 4;
                await safeReply(message, '🆔 Enter your *CNIC* (e.g. 12345-1234567-1):');
                break;

            case 4:
                currentState.patientData.cnic = message.body.trim();
                currentState.step = 5;
                await safeReply(message, '🔍 Enter the *Doctor ID* you want to book an appointment with:');
                break;

            case 5:
                currentState.doctorId = parseInt(message.body.trim());
                if (isNaN(currentState.doctorId)) {
                    await safeReply(message, '❌ Invalid Doctor ID. Please enter a number:');
                    return;
                }

                try {
                    const [doctors] = await db.query('SELECT * FROM doctors WHERE DoctorID = ?', [currentState.doctorId]);
                    if (doctors.length === 0) {
                        await safeReply(message, '❌ Doctor not found. Please enter a valid Doctor ID:');
                        return;
                    }
                    currentState.step = 6;
                    await safeReply(message, '✅ Doctor found.\n\nRegistering patient...');
                } catch (err) {
                    console.error('❌ DB Error:', err);
                    await safeReply(message, '❌ Error checking doctor. Try again.');
                    return;
                }

                try {
                    const { fullName, gender, phone, cnic } = currentState.patientData;

                    await db.query(
                        `INSERT INTO patients (Patient_Name, Gender, Patient_No, Patient_Cnic, status) 
                         VALUES (?, ?, ?, ?, 'Active')`,
                        [fullName, gender, phone, cnic]
                    );

                    const [rows] = await db.query('SELECT LAST_INSERT_ID() as id');
                    currentState.patientId = rows[0].id;

                    currentState.step = 7;
                    await safeReply(message, '✅ Patient registered successfully.\n\nSelect appointment type:\n1️⃣ Casual (Rs. 2000)\n2️⃣ Urgent (Rs. 3000)');
                } catch (err) {
                    console.error('❌ Patient Registration Error:', err);
                    const errorMsg = err.message || 'Unknown error';
                    await safeReply(message, `❌ Failed to register patient.\n🛠️ Error: ${errorMsg}`);
                    resetState(userId);
                }
                break;

            case 7:
                const type = message.body.trim() === '1' ? 'Casual' : message.body.trim() === '2' ? 'Urgent' : null;
                if (!type) {
                    await safeReply(message, '❌ Invalid choice. Please type:\n1️⃣ Casual\n2️⃣ Urgent');
                    return;
                }

                const fee = type === 'Casual' ? 2000 : 3000;

                try {
                    const [result] = await db.query(
                        `INSERT INTO appointments 
                         (PatientID, DoctorID, AppointmentDate, AppointmentType, AppointmentFee, status) 
                         VALUES (?, ?, NOW(), ?, ?, 'Scheduled')`,
                        [currentState.patientId, currentState.doctorId, type, fee]
                    );

                    const [appointment] = await db.query(
                        'SELECT * FROM appointments WHERE AppointmentID = ?',
                        [result.insertId]
                    );

                    if (appointment.length > 0) {
                        const appt = appointment[0];
                        await safeReply(message,
                            `✅ *Appointment Booked!*\n\n` +
                            `📋 ID: ${appt.AppointmentID}\n` +
                            `👨‍⚕️ Doctor ID: ${appt.DoctorID}\n` +
                            `📅 Date: ${new Date(appt.AppointmentDate).toLocaleString()}\n` +
                            `⚙️ Type: ${appt.AppointmentType}\n` +
                            `💵 Fee: Rs. ${appt.AppointmentFee}\n\n` +
                            `Thank you for using our service!`);
                    } else {
                        await safeReply(message, '❌ Error retrieving appointment details');
                    }
                } catch (err) {
                    console.error('❌ Appointment DB Error:', err);
                    const errorMsg = err.message || 'Unknown error';
                    await safeReply(message, `❌ Failed to book appointment.\n🛠️ Error: ${errorMsg}`);
                }

                resetState(userId);
                break;

            default:
                await safeReply(message, '👋 Hi! Type "book appointment" to start booking or "info" for clinic information.');
                break;
        }
    } catch (err) {
        console.error('Error handling message:', err);
        await safeReply(message, '⚠️ An error occurred. Please try again later');
        resetState(userId);
    }
});

// Start bot
(async () => {
    await connectDB();
    if (!await initializeWhatsApp()) {
        console.error('❌ Failed to initialize WhatsApp client');
        process.exit(1);
    }
    console.log('🚀 Bot is running...');
})();