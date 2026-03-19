const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.redirect("/host.html");
});

// ── Game State ──────────────────────────────────────────────
const gameState = {
  phase: "waiting",
  roles: {},
  passengers: {},
  clerk: null,
  host: null,
  checkin: {
    passportRequested: false,
    passportReceived: false,
    passportValid: false,
    bagsRequested: false,
    bagsOnBelt: false,
    bagsConfirmed: false,
    bagCount: 0,
    bagWeight: 0,
    seatAssigned: false,
    seatType: "",
    boardingPassIssued: false,
    overweightBag: false,
    overweightFee: 0,
    overweightFeePaid: false,
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
    askingDestination: false,
    destinationCorrect: false,
    destinationEntered: "",
  },
  log: [],
};

function resetCheckin() {
  gameState.checkin = {
    passportRequested: false,
    passportReceived: false,
    passportValid: false,
    bagsRequested: false,
    bagsOnBelt: false,
    bagsConfirmed: false,
    bagCount: 0,
    bagWeight: 0,
    seatAssigned: false,
    seatType: "",
    boardingPassIssued: false,
    overweightBag: false,
    overweightFee: 0,
    overweightFeePaid: false,
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
    askingDestination: false,
    destinationCorrect: false,
    destinationEntered: "",
  };
  gameState.log = [];
  gameState.phase = "waiting";
}

function addLog(message, type = "info") {
  const entry = {
    message,
    type,
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

  socket.on("join_host", () => {
    gameState.host = socket.id;
    gameState.roles[socket.id] = "host";
    socket.emit("joined", { role: "host" });
    broadcastToHost();
  });

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

      const firstNames = ["Sarah","James","Emily","Michael","Olivia",
                          "David","Sophia","Daniel","Emma","Lucas"];
      const lastNames  = ["Johnson","Williams","Brown","Taylor","Anderson",
                          "Wilson","Martinez","Thompson","Garcia","Davis"];
      const destinations = ["London Heathrow","Tokyo Haneda","New York JFK",
                            "Sydney Airport","Paris Charles de Gaulle",
                            "Singapore Changi","Dubai International"];

      const firstName   = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName    = lastNames[Math.floor(Math.random() * lastNames.length)];
      const age         = Math.floor(18 + Math.random() * 50);
      const flightNum   = "AB" + Math.floor(100 + Math.random() * 900);
      const passportNo  = (Math.random().toString(36).substring(2,4) +
                          Math.floor(100000 + Math.random() * 900000)).toUpperCase();
      const destination = destinations[Math.floor(Math.random() * destinations.length)];
      const seat        = (Math.floor(1 + Math.random() * 30)) +
                          ["A","B","C","D","E","F"][Math.floor(Math.random()*6)];

      const scenarios = [
        {
          type: "single", bags: 1, carryOn: false,
          weights: [Math.floor(10 + Math.random() * 13)],
          description: "1 checked bag"
        },
        {
          type: "double", bags: 2, carryOn: false,
          weights: [
            Math.floor(10 + Math.random() * 13),
            Math.floor(10 + Math.random() * 13),
          ],
          description: "2 checked bags"
        },
        {
          type: "carryon", bags: 1, carryOn: true,
          weights: [Math.floor(10 + Math.random() * 13)],
          carryOnWeight: Math.floor(5 + Math.random() * 5),
          description: "1 checked bag + 1 carry-on"
        },
        {
          type: "overweight", bags: 1, carryOn: false,
          weights: [Math.floor(24 + Math.random() * 8)],
          description: "1 overweight bag",
          overweight: true
        },
        {
          type: "double_overweight", bags: 2, carryOn: false,
          weights: [
            Math.floor(24 + Math.random() * 8),
            Math.floor(10 + Math.random() * 13),
          ],
          description: "2 bags, 1 overweight",
          overweight: true
        },
      ];

      const luggage = scenarios[Math.floor(Math.random() * scenarios.length)];

      gameState.passengers[socket.id] = {
        name: name || "Alex",
        identity: {
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`,
          age: age.toString(),
          flightNum,
          passportNo,
          destination,
          seat,
        },
        luggage,
        items: {
          passport: { label: "Passport", emoji: "🛂", owned: true,  sent: false },
          luggage:  { label: "Luggage",  emoji: "🧳", owned: true,  sent: false },
          carryOn:  { label: "Carry-on", emoji: "🎒", owned: luggage.carryOn, sent: false },
          phone:    { label: "Phone",    emoji: "📱", owned: true,  sent: false },
          water:    { label: "Water",    emoji: "💧", owned: true,  sent: false },
          keys:     { label: "Keys",     emoji: "🔑", owned: true,  sent: false },
          coins:    { label: "Coins",    emoji: "🪙", owned: true,  sent: false },
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

  // ── Clerk Actions ──────────────────────────────────────────
  socket.on("clerk_action", ({ action, data }) => {
    if (gameState.roles[socket.id] !== "clerk") return;
    const ci = gameState.checkin;

    switch (action) {

      case "ask_firstname": {
        ci.askingFirstName = true;
        addLog("🧑‍💼 Clerk: What is your first name?", "action");
        broadcastToPassengers();
        broadcastToClerk();
        break;
      }

      case "check_firstname": {
        const p1 = Object.values(gameState.passengers)[0];
        const correct1 = p1?.identity?.firstName || "";
        if (data.answer.trim().toLowerCase() === correct1.toLowerCase()) {
          ci.firstNameCorrect = true;
          ci.firstNameEntered = data.answer;
          addLog(`✅ First name correct: ${data.answer}`, "success");
          io.to(socket.id).emit("spelling_result", {
            field: "firstName", correct: true, answer: data.answer
          });
        } else {
          addLog(`❌ Wrong first name: ${data.answer}`, "warning");
          io.to(socket.id).emit("spelling_result", {
            field: "firstName", correct: false,
            answer: data.answer,
            hint: `Starts with "${correct1[0]}"`
          });
        }
        broadcastAll();
        break;
      }

      case "ask_lastname": {
        ci.askingLastName = true;
        addLog("🧑‍💼 Clerk: What is your last name?", "action");
        broadcastToPassengers();
        broadcastToClerk();
        break;
      }

      case "check_lastname": {
        const p2 = Object.values(gameState.passengers)[0];
        const correct2 = p2?.identity?.lastName || "";
        if (data.answer.trim().toLowerCase() === correct2.toLowerCase()) {
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
            answer: data.answer,
            hint: `Starts with "${correct2[0]}"`
          });
        }
        broadcastAll();
        break;
      }

      case "ask_age": {
        ci.askingAge = true;
        addLog("🧑‍💼 Clerk: How old are you?", "action");
        broadcastToPassengers();
        broadcastToClerk();
        break;
      }

      case "check_age": {
        const p3 = Object.values(gameState.passengers)[0];
        const correct3 = p3?.identity?.age || "";
        if (data.answer.trim() === correct3) {
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
      }

      case "ask_flightnum": {
        ci.askingFlight = true;
        addLog("🧑‍💼 Clerk: What is your flight number?", "action");
        broadcastToPassengers();
        broadcastToClerk();
        break;
      }

      case "check_flightnum": {
        const p4 = Object.values(gameState.passengers)[0];
        const correct4 = p4?.identity?.flightNum || "";
        if (data.answer.trim().toUpperCase() === correct4.toUpperCase()) {
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
      }

      case "ask_passport": {
        ci.askingPassportNo = true;
        addLog("🧑‍💼 Clerk: What is your passport number?", "action");
        broadcastToPassengers();
        broadcastToClerk();
        break;
      }

      case "check_passport": {
        const p5 = Object.values(gameState.passengers)[0];
        const correct5 = p5?.identity?.passportNo || "";
        if (data.answer.trim().toUpperCase() === correct5.toUpperCase()) {
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
      }

      case "ask_destination": {
        ci.askingDestination = true;
        addLog("🧑‍💼 Clerk: Where are you heading today?", "action");

        const allDests = [
          "London Heathrow", "Tokyo Haneda", "New York JFK",
          "Sydney Airport", "Paris Charles de Gaulle",
          "Singapore Changi", "Dubai International"
        ];
        const correctDest = Object.values(gameState.passengers)[0]?.identity?.destination;
        const wrongDests = allDests
          .filter(d => d !== correctDest)
          .sort(() => Math.random() - 0.5)
          .slice(0, 2);
        const choices = [correctDest, ...wrongDests]
          .sort(() => Math.random() - 0.5);

        io.to(socket.id).emit("destination_choices", {
          correct: correctDest,
          choices: choices
        });

        broadcastToPassengers();
        broadcastToClerk();
        break;
      }

      case "confirm_destination": {
        const p6 = Object.values(gameState.passengers)[0];
        const correct6 = p6?.identity?.destination || "";
        if (data.destination.trim().toLowerCase() === correct6.toLowerCase()) {
          ci.destinationCorrect = true;
          ci.destinationEntered = data.destination;
          addLog(`✅ Destination confirmed: ${correct6}`, "success");
          io.to(socket.id).emit("destination_result", {
            correct: true, destination: correct6
          });
        } else {
          addLog(`❌ Wrong destination: ${data.destination}`, "warning");
          io.to(socket.id).emit("destination_result", {
            correct: false, destination: data.destination
          });
        }
        broadcastAll();
        break;
      }

      case "request_passport": {
        ci.passportRequested = true;
        addLog("🧑‍💼 Clerk: May I see your passport please?", "action");
        broadcastToPassengers();
        break;
      }

      case "passport_check_ok": {
        ci.passportValid = true;
        addLog("✅ Clerk: Passport is valid. Thank you!", "success");
        broadcastAll();
        break;
      }

      case "request_bags": {
        ci.bagsRequested = true;
        addLog("🧑‍💼 Clerk: How many bags are you checking in?", "action");
        broadcastToPassengers();
        break;
      }

      case "confirm_bag_weight": {
        const pDataBag = Object.values(gameState.passengers)[0];
        const pLuggage = pDataBag?.luggage;
        const bagIndex = data.bagIndex || 0;
        const correctWeight = pLuggage?.weights[bagIndex];
        const isCorrectWeight = data.weight === correctWeight;
        const WEIGHT_LIMIT = 23;

        if (isCorrectWeight) {
          addLog(`✅ Bag ${bagIndex + 1} weight confirmed: ${data.weight}kg`, "success");

          if (data.weight > WEIGHT_LIMIT) {
            ci.overweightBag = true;
            ci.overweightFee = (data.weight - WEIGHT_LIMIT) * 10;
            addLog(`⚠️ BAG OVERWEIGHT! ${data.weight}kg exceeds 23kg!`, "warning");
            io.to(socket.id).emit("bag_overweight", {
              weight: data.weight,
              limit: WEIGHT_LIMIT,
              fee: ci.overweightFee,
              bagNumber: bagIndex + 1
            });
            const passengerSocket = Object.entries(gameState.roles)
              .find(([, r]) => r === "passenger");
            if (passengerSocket) {
              io.to(passengerSocket[0]).emit("passenger_overweight_notice", {
                weight: data.weight,
                fee: ci.overweightFee
              });
            }
          }

          if (pLuggage.bags === 2 && bagIndex === 0) {
            io.to(socket.id).emit("enter_bag_weight", {
              bagNumber: 2, totalBags: 2,
              hasCarryOn: pLuggage.carryOn, bagIndex: 1
            });
            const passengerSocket2 = Object.entries(gameState.roles)
              .find(([, r]) => r === "passenger");
            if (passengerSocket2) {
              io.to(passengerSocket2[0]).emit("show_luggage_info", {
                luggage: pLuggage, bagIndex: 1
              });
            }
          } else if (pLuggage.carryOn && !ci.overweightBag) {
            io.to(socket.id).emit("enter_carry_on_weight", {
              carryOnWeight: pLuggage.carryOnWeight
            });
            const passengerSocket3 = Object.entries(gameState.roles)
              .find(([, r]) => r === "passenger");
            if (passengerSocket3) {
              io.to(passengerSocket3[0]).emit("show_luggage_info", {
                luggage: pLuggage, bagIndex: "carryOn"
              });
            }
          } else if (!ci.overweightBag) {
            ci.bagsConfirmed = true;
            addLog("✅ All bags processed!", "success");
          }

          io.to(socket.id).emit("weight_result", {
            correct: true, weight: data.weight, bagIndex
          });

        } else {
          addLog(`❌ Wrong weight! Expected ${correctWeight}kg`, "warning");
          io.to(socket.id).emit("weight_result", {
            correct: false, correct_weight: correctWeight, entered: data.weight
          });
        }
        broadcastAll();
        break;
      }

      case "confirm_carry_on_weight": {
        const pDataCarry = Object.values(gameState.passengers)[0];
        const correctCarryWeight = pDataCarry?.luggage?.carryOnWeight;
        if (data.weight === correctCarryWeight) {
          ci.bagsConfirmed = true;
          addLog(`✅ Carry-on weight confirmed: ${data.weight}kg`, "success");
          io.to(socket.id).emit("carry_on_result", {
            correct: true, weight: data.weight
          });
        } else {
          addLog("❌ Wrong carry-on weight!", "warning");
          io.to(socket.id).emit("carry_on_result", { correct: false });
        }
        broadcastAll();
        break;
      }

      case "overweight_fee_paid": {
        ci.overweightFeePaid = true;
        ci.bagsConfirmed = true;
        addLog(`💰 Overweight fee paid: $${data.fee}`, "success");
        broadcastAll();
        break;
      }

      case "assign_seat": {
        ci.seatAssigned = true;
        ci.seatType = data.seatType;
        const seatEmoji = data.seatType === "window" ? "🪟" :
                          data.seatType === "aisle"  ? "🚶" : "💺";
        addLog(`${seatEmoji} Clerk assigned ${data.seatType} seat`, "action");

        const passengerSocket = Object.entries(gameState.roles)
          .find(([, r]) => r === "passenger");
        if (passengerSocket) {
          const pData = gameState.passengers[passengerSocket[0]];
          pData.boardingPass = {
            name:        pData.identity.fullName,
            flight:      pData.identity.flightNum,
            seat:        seatEmoji + " " + pData.identity.seat,
            gate:        "B" + Math.floor(1 + Math.random() * 20),
            time:        "10:45",
            destination: pData.identity.destination,
          };
          ci.boardingPassIssued = true;
          gameState.phase = "complete";
          addLog("🎉 Boarding pass issued! Check-in complete!", "success");
          io.to(passengerSocket[0]).emit("boarding_pass", pData.boardingPass);
        }
        broadcastAll();
        break;
      }

    } // end switch
  }); // end clerk_action

  // ── Passenger Actions ──────────────────────────────────────
  socket.on("passenger_action", ({ action, data }) => {
    if (gameState.roles[socket.id] !== "passenger") return;
    const ci = gameState.checkin;
    const pData = gameState.passengers[socket.id];

    switch (action) {
      case "send_item": {
        const item = pData.items[data.itemKey];
        if (!item || item.sent) return;

        if (data.itemKey === "passport" && ci.passportRequested && !ci.passportReceived) {
          item.sent = true;
          ci.passportReceived = true;
          addLog("🛂 Passenger hands over passport", "action");
          if (gameState.clerk) {
            io.to(gameState.clerk).emit("item_received", {
              itemKey: "passport", item
            });
          }

        } else if (data.itemKey === "luggage" && ci.bagsRequested && !ci.bagsOnBelt) {
          item.sent = true;
          ci.bagsOnBelt = true;
          addLog("🧳 Passenger puts luggage on belt", "action");

          socket.emit("show_luggage_info", {
            luggage: pData.luggage, bagIndex: 0
          });

          if (gameState.clerk) {
            io.to(gameState.clerk).emit("enter_bag_weight", {
              bagNumber: 1,
              totalBags: pData.luggage.bags,
              hasCarryOn: pData.luggage.carryOn,
              bagIndex: 0
            });
          }

        } else if (data.itemKey === "carryOn" && ci.bagsOnBelt && !ci.bagsConfirmed) {
          item.sent = true;
          addLog("🎒 Passenger puts carry-on on belt", "action");

          socket.emit("show_luggage_info", {
            luggage: pData.luggage, bagIndex: "carryOn"
          });

          if (gameState.clerk) {
            io.to(gameState.clerk).emit("enter_carry_on_weight", {
              carryOnWeight: pData.luggage.carryOnWeight
            });
          }

        } else {
          socket.emit("item_rejected", {
            itemKey: data.itemKey,
            msg: "The clerk didn't ask for that item yet!"
          });
        }

        socket.emit("inventory_update", { items: pData.items });
        broadcastAll();
        break;
      }
    }
  });

  // ── Reset ──────────────────────────────────────────────────
  socket.on("reset_game", () => {
    if (gameState.roles[socket.id] !== "host") return;
    resetCheckin();
    Object.keys(gameState.passengers).forEach((pid) => {
      const pLuggage = gameState.passengers[pid].luggage;
      Object.keys(gameState.passengers[pid].items).forEach((key) => {
        gameState.passengers[pid].items[key].sent = false;
      });
      gameState.passengers[pid].boardingPass = null;
    });
    addLog("🔄 Game reset!", "info");
    broadcastAll();
    io.emit("game_reset");
  });

  // ── Disconnect ─────────────────────────────────────────────
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

}); // end io.on connection

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🛫 Airport Game running at http://localhost:${PORT}`);
  console.log(`   Host screen  → http://localhost:${PORT}/host.html`);
  console.log(`   Players join → http://localhost:${PORT}/join.html\n`);
});