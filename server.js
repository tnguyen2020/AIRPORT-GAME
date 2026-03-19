const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ── Game State ──────────────────────────────────────────────
const gameState = {
  phase: "waiting", // waiting | checkin | complete
  roles: {},        // socketId → role
  passengers: {},   // socketId → passenger data
  clerk: null,      // clerk socketId
  host: null,       // host socketId

  checkin: {
    passportRequested: false,
    passportReceived: false,
    passportValid: false,
    bagsRequested: false,
    bagsConfirmed: false,
    bagCount: 0,
    bagWeight: 0,
    seatAssigned: false,
    seatType: "",
    boardingPassIssued: false,
  },

  log: [], // activity log shown on host screen
};

function resetCheckin() {
  gameState.checkin = {
    passportRequested: false,
    passportReceived: false,
    passportValid: false,
    bagsRequested: false,
    bagsConfirmed: false,
    bagCount: 0,
    bagWeight: 0,
    seatAssigned: false,
    seatType: "",
    boardingPassIssued: false,
        bagsOnBelt: false,
    clerkEnteredWeight: 0,
    askingFirstName: false,
    firstNameCorrect: false,
    firstNameEntered: "",
    askingLastName: false,
    lastNameCorrect: false,
    lastNameEntered: "",
    askingAge: false,
    ageCorrect: false,
    askingFlight: false,
    flightCorrect: false,
    askingPassportNo: false,
    passportNoCorrect: false,
  };
  gameState.log = [];
  gameState.phase = "waiting";
}

function addLog(message, type = "info") {
  const entry = {
    message,
    type, // info | success | warning | action
    time: new Date().toLocaleTimeString(),
  };
  gameState.log.unshift(entry);
  if (gameState.log.length > 6) gameState.log.pop();
  broadcastToHost();
}

function broadcastToHost() {
  if (gameState.host) {
    io.to(gameState.host).emit("state_update", gameState);
  }
}

function broadcastToClerk() {
  if (gameState.clerk) {
    io.to(gameState.clerk).emit("state_update", {
      checkin: gameState.checkin,
      phase: gameState.phase,
    });
  }
}

function broadcastToPassengers() {
  Object.entries(gameState.roles).forEach(([id, role]) => {
    if (role === "passenger") {
      io.to(id).emit("state_update", {
        checkin: gameState.checkin,
        phase: gameState.phase,
        passengerData: gameState.passengers[id],
      });
    }
  });
}

function broadcastAll() {
  broadcastToHost();
  broadcastToClerk();
  broadcastToPassengers();
}

// ── Socket Events ────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Join as host ──
  socket.on("join_host", () => {
    gameState.host = socket.id;
    gameState.roles[socket.id] = "host";
    console.log(`[HOST] ${socket.id}`);
    socket.emit("joined", { role: "host" });
    broadcastToHost();
  });

  // ── Join as player (phone) ──
socket.on("join_player", ({ name, savedRole }) => {
  const takenRoles = Object.values(gameState.roles);
  let assignedRole = "";

  if (gameState.roles[socket.id]) {
    assignedRole = gameState.roles[socket.id];
    socket.emit("joined", {
      role: assignedRole,
      name: name,
      passengerData: assignedRole === "passenger" ?
        gameState.passengers[socket.id] : null,
    });
    return;
  }

  if (!takenRoles.includes("passenger")) {
    assignedRole = "passenger";

    // ── Random passenger identity ──
    const firstNames = ["Sarah", "James", "Emily", "Michael", "Olivia", "David", "Sophia", "Daniel", "Emma", "Lucas"];
    const lastNames  = ["Johnson", "Williams", "Brown", "Taylor", "Anderson", "Wilson", "Martinez", "Thompson", "Garcia", "Davis"];
    const destinations = ["London Heathrow", "Tokyo Haneda", "New York JFK", "Sydney Airport", "Paris Charles de Gaulle", "Singapore Changi", "Dubai International"];

    const firstName   = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName    = lastNames[Math.floor(Math.random() * lastNames.length)];
    const age         = Math.floor(18 + Math.random() * 50);
    const flightNum   = "AB" + Math.floor(100 + Math.random() * 900);
    const passportNo  = (Math.random().toString(36).substring(2,4) + Math.floor(100000 + Math.random() * 900000)).toUpperCase();
    const destination = destinations[Math.floor(Math.random() * destinations.length)];
    const seat        = (Math.floor(1 + Math.random() * 30)) + ["A","B","C","D","E","F"][Math.floor(Math.random()*6)];

    gameState.passengers[socket.id] = {
      name: name || "Alex",
      identity: {
        firstName,
        lastName,
        fullName:    `${firstName} ${lastName}`,
        age:         age.toString(),
        flightNum,
        passportNo,
        destination,
        seat,
      },
      items: {
        passport: { label: "Passport", emoji: "🛂", owned: true, sent: false },
        luggage:  { label: "Luggage",  emoji: "🧳", owned: true, sent: false },
        phone:    { label: "Phone",    emoji: "📱", owned: true, sent: false },
        water:    { label: "Water",    emoji: "💧", owned: true, sent: false },
        keys:     { label: "Keys",     emoji: "🔑", owned: true, sent: false },
        coins:    { label: "Coins",    emoji: "🪙", owned: true, sent: false },
      },
      boardingPass: null,
    };
  } else if (!takenRoles.includes("clerk")) {
    assignedRole = "clerk";
    gameState.clerk = socket.id;
  } else {
    socket.emit("error_msg", { msg: "Room is full!" });
    return;
  }

  gameState.roles[socket.id] = assignedRole;
  socket.emit("joined", {
    role: assignedRole,
    name: name,
    passengerData: assignedRole === "passenger" ?
      gameState.passengers[socket.id] : null,
  });

  addLog(`✅ ${name} joined as ${assignedRole}`, "success");

  const roles = Object.values(gameState.roles).filter((r) => r !== "host");
  if (roles.includes("passenger") && roles.includes("clerk")) {
    gameState.phase = "checkin";
    addLog("🎬 Check-in scenario started!", "success");
    broadcastAll();
  }
});

  // ── Clerk actions ──
  socket.on("clerk_action", ({ action, data }) => {
    if (gameState.roles[socket.id] !== "clerk") return;
    const ci = gameState.checkin;

    switch (action) {
        case "ask_firstname":
  ci.askingFirstName = true;
  addLog("🧑‍💼 Clerk: What is your first name?", "action");
  broadcastToPassengers();
  broadcastToClerk();
  break;

case "check_firstname":
  const passengerFirst = Object.values(gameState.passengers)[0];
  const correctFirst = passengerFirst?.identity?.firstName || "";
  if (data.answer.trim().toLowerCase() === correctFirst.toLowerCase()) {
    ci.firstNameCorrect = true;
    ci.firstNameEntered = data.answer;
    addLog(`✅ First name correct: ${data.answer}`, "success");
    io.to(socket.id).emit("spelling_result", { 
      field: "firstName", correct: true, answer: data.answer 
    });
  } else {
    addLog(`❌ Wrong first name: ${data.answer} (correct: ${correctFirst})`, "warning");
    io.to(socket.id).emit("spelling_result", { 
      field: "firstName", correct: false, 
      answer: data.answer, hint: `Starts with "${correctFirst[0]}"` 
    });
  }
  broadcastAll();
  break;

case "ask_lastname":
  ci.askingLastName = true;
  addLog("🧑‍💼 Clerk: What is your last name?", "action");
  broadcastToPassengers();
  broadcastToClerk();
  break;

case "check_lastname":
  const passengerLast = Object.values(gameState.passengers)[0];
  const correctLast = passengerLast?.identity?.lastName || "";
  if (data.answer.trim().toLowerCase() === correctLast.toLowerCase()) {
    ci.lastNameCorrect = true;
    ci.lastNameEntered = data.answer;
    addLog(`✅ Last name correct: ${data.answer}`, "success");
    io.to(socket.id).emit("spelling_result", { 
      field: "lastName", correct: true, answer: data.answer 
    });
  } else {
    addLog(`❌ Wrong last name: ${data.answer}`, "warning");
    io.to(socket.id).emit("spelling_result", { 
      field: "lastName", correct: false, 
      answer: data.answer, hint: `Starts with "${correctLast[0]}"` 
    });
  }
  broadcastAll();
  break;

case "ask_age":
  ci.askingAge = true;
  addLog("🧑‍💼 Clerk: How old are you?", "action");
  broadcastToPassengers();
  broadcastToClerk();
  break;

case "check_age":
  const passengerAge = Object.values(gameState.passengers)[0];
  const correctAge = passengerAge?.identity?.age || "";
  if (data.answer.trim() === correctAge) {
    ci.ageCorrect = true;
    addLog(`✅ Age correct: ${data.answer}`, "success");
    io.to(socket.id).emit("spelling_result", { 
      field: "age", correct: true, answer: data.answer 
    });
  } else {
    addLog(`❌ Wrong age: ${data.answer}`, "warning");
    io.to(socket.id).emit("spelling_result", { 
      field: "age", correct: false, answer: data.answer 
    });
  }
  broadcastAll();
  break;

case "ask_flightnum":
  ci.askingFlight = true;
  addLog("🧑‍💼 Clerk: What is your flight number?", "action");
  broadcastToPassengers();
  broadcastToClerk();
  break;

case "check_flightnum":
  const passengerFlight = Object.values(gameState.passengers)[0];
  const correctFlight = passengerFlight?.identity?.flightNum || "";
  if (data.answer.trim().toUpperCase() === correctFlight.toUpperCase()) {
    ci.flightCorrect = true;
    addLog(`✅ Flight number correct: ${data.answer}`, "success");
    io.to(socket.id).emit("spelling_result", { 
      field: "flightNum", correct: true, answer: data.answer 
    });
  } else {
    addLog(`❌ Wrong flight number: ${data.answer}`, "warning");
    io.to(socket.id).emit("spelling_result", { 
      field: "flightNum", correct: false, answer: data.answer 
    });
  }
  broadcastAll();
  break;

case "ask_passport":
  ci.askingPassportNo = true;
  addLog("🧑‍💼 Clerk: What is your passport number?", "action");
  broadcastToPassengers();
  broadcastToClerk();
  break;

case "check_passport":
  const passengerPass = Object.values(gameState.passengers)[0];
  const correctPass = passengerPass?.identity?.passportNo || "";
  if (data.answer.trim().toUpperCase() === correctPass.toUpperCase()) {
    ci.passportNoCorrect = true;
    addLog(`✅ Passport number correct: ${data.answer}`, "success");
    io.to(socket.id).emit("spelling_result", { 
      field: "passportNo", correct: true, answer: data.answer 
    });
  } else {
    addLog(`❌ Wrong passport number: ${data.answer}`, "warning");
    io.to(socket.id).emit("spelling_result", { 
      field: "passportNo", correct: false, answer: data.answer 
    });
  }
  broadcastAll();
  break;
      case "confirm_bag_weight":
        ci.bagsConfirmed = true;
        ci.bagCount = 1;
        ci.clerkEnteredWeight = data.weight;
        const isCorrect = data.weight === ci.bagWeight;
        if (isCorrect) {
          addLog(`✅ Clerk confirmed bag weight: ${data.weight}kg`, "success");
          io.to(socket.id).emit("weight_result", { correct: true, weight: data.weight });
        } else {
          addLog(`❌ Wrong weight! Passenger said ${ci.bagWeight}kg, clerk typed ${data.weight}kg`, "warning");
          io.to(socket.id).emit("weight_result", { correct: false, correct_weight: ci.bagWeight, entered: data.weight });
          ci.bagsConfirmed = false;
        }
        break;
      case "request_passport":
        ci.passportRequested = true;
        addLog("🧑‍💼 Clerk: May I see your passport please?", "action");
        broadcastToPassengers();
        break;

      case "passport_check_ok":
        ci.passportValid = true;
        addLog("✅ Clerk: Passport is valid. Thank you!", "success");
        break;

      case "passport_check_fail":
        ci.passportValid = false;
        addLog("❌ Clerk: I'm sorry, there's an issue with your passport.", "warning");
        break;

      case "request_bags":
        ci.bagsRequested = true;
        addLog("🧑‍💼 Clerk: How many bags are you checking in?", "action");
        broadcastToPassengers();
        break;

      case "assign_seat":
        ci.seatAssigned = true;
        ci.seatType = data.seatType;
        const seatEmoji = data.seatType === "window" ? "🪟" : data.seatType === "aisle" ? "🚶" : "💺";
        addLog(`${seatEmoji} Clerk: I've assigned you a ${data.seatType} seat.`, "action");

        // Generate boarding pass
        const passengerSocket = Object.entries(gameState.roles).find(([, r]) => r === "passenger");
        if (passengerSocket) {
          const pData = gameState.passengers[passengerSocket[0]];
          pData.boardingPass = {
            name: pData.name,
            flight: "AB" + Math.floor(100 + Math.random() * 900),
            seat: seatEmoji + " " + data.seatType.toUpperCase(),
            gate: "B" + Math.floor(1 + Math.random() * 20),
            time: "10:45",
            destination: "London Heathrow ✈️",
          };
          ci.boardingPassIssued = true;
          gameState.phase = "complete";
          addLog("🎉 Boarding pass issued! Check-in complete!", "success");
          io.to(passengerSocket[0]).emit("boarding_pass", pData.boardingPass);
        }
        break;
    }

    broadcastAll();
  });

  // ── Passenger actions ──
  socket.on("passenger_action", ({ action, data }) => {
    if (gameState.roles[socket.id] !== "passenger") return;
    const ci = gameState.checkin;
    const pData = gameState.passengers[socket.id];

    switch (action) {
      case "send_item":
        const item = pData.items[data.itemKey];
        if (!item || item.sent) return;

        if (data.itemKey === "passport" && ci.passportRequested && !ci.passportReceived) {
          item.sent = true;
          ci.passportReceived = true;
          addLog(`🛂 Passenger hands over passport`, "action");

          // Notify clerk
          if (gameState.clerk) {
            io.to(gameState.clerk).emit("item_received", {
              itemKey: "passport",
              item: item,
            });
          }
          } else if (data.itemKey === "luggage" && ci.bagsRequested && !ci.bagsConfirmed) {
    item.sent = true;
    ci.bagsOnBelt = true;
    ci.bagWeight = Math.floor(10 + Math.random() * 13); // 10–22 kg
    addLog(`🧳 Passenger puts luggage on belt`, "action");

    // Send weight ONLY to passenger screen
    socket.emit("show_bag_weight", { weight: ci.bagWeight });

    // Tell clerk to enter weight
    if (gameState.clerk) {
      io.to(gameState.clerk).emit("enter_bag_weight");
    }
  } else {
          // Wrong item
          socket.emit("item_rejected", {
            itemKey: data.itemKey,
            msg: "The clerk didn't ask for that item yet!",
          });
          addLog(`⚠️ Passenger tried to hand over ${item.label} (not needed yet)`, "warning");
        }

        socket.emit("inventory_update", { items: pData.items });
        break;
    }

    broadcastAll();
  });

  // ── Reset game ──
  socket.on("reset_game", () => {
    if (gameState.roles[socket.id] !== "host") return;
    resetCheckin();
    // Reset passenger items
    Object.keys(gameState.passengers).forEach((pid) => {
      Object.keys(gameState.passengers[pid].items).forEach((key) => {
        gameState.passengers[pid].items[key].sent = false;
      });
      gameState.passengers[pid].boardingPass = null;
    });
    addLog("🔄 Game reset. Waiting to start...", "info");
    broadcastAll();
    io.emit("game_reset");
  });

  // ── Disconnect ──
  socket.on("disconnect", () => {
    const role = gameState.roles[socket.id];
    if (role) {
      addLog(`⚠️ ${role} disconnected`, "warning");
      delete gameState.roles[socket.id];
      if (role === "passenger") delete gameState.passengers[socket.id];
      if (role === "clerk") gameState.clerk = null;
      if (role === "host") gameState.host = null;
      broadcastAll();
    }
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🛫 Airport Game running at http://localhost:${PORT}`);
  console.log(`   Host screen  → http://localhost:${PORT}/host.html`);
  console.log(`   Players join → http://localhost:${PORT}/join.html\n`);
});