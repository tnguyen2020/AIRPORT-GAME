const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static("public"));
app.get("/", (req, res) => res.redirect("/host.html"));

// ── Game State ───────────────────────────────────────────────
let gameState = freshState();

function freshState() {
  return {
    phase:           "waiting",
    scenario:        "checkin",
    roles:           {},
    passengers:      {},
    clerk:           null,
    security:        null,
    host:            null,
    checkin:         freshCheckin(),
    securityState:   freshSecurity(),
    log:             [],
  };
}

function freshCheckin() {
  return {
    passportRequested:  false, passportReceived:   false,
    passportValid:      false, bagsRequested:       false,
    bagsOnBelt:         false, bagsConfirmed:       false,
    bagCount:           0,     bagWeight:           0,
    seatAssigned:       false, seatType:            "",
    boardingPassIssued: false, overweightBag:       false,
    overweightFee:      0,     overweightFeePaid:   false,
    askingFirstName:    false, firstNameCorrect:    false, firstNameEntered: "",
    askingLastName:     false, lastNameCorrect:     false, lastNameEntered:  "",
    askingAge:          false, ageCorrect:          false,
    askingFlight:       false, flightCorrect:       false,
    askingPassportNo:   false, passportNoCorrect:   false,
    askingDestination:  false, destinationCorrect:  false, destinationEntered: "",
  };
}

function freshSecurity() {
  return {
    trayRequested:       false,
    laptopTrayRequested: false,
    itemsInTray:         [],
    scanStarted:         false,
    beeped:              false,
    beepReason:          "",
    wandChecked:         false,
    cleared:             false,
  };
}

// ── Helpers ──────────────────────────────────────────────────
function addLog(message, type = "info") {
  gameState.log.unshift({
    message, type,
    time: new Date().toLocaleTimeString(),
  });
  if (gameState.log.length > 8) gameState.log.pop();
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
      phase:   gameState.phase,
    });
  }
}

function broadcastToSecurity() {
  if (gameState.security) {
    io.to(gameState.security).emit("state_update", {
      securityState: gameState.securityState,
      phase:         gameState.phase,
    });
  }
}

function broadcastToPassengers() {
  Object.entries(gameState.roles).forEach(([id, role]) => {
    if (role === "passenger") {
      io.to(id).emit("state_update", {
        checkin:       gameState.checkin,
        phase:         gameState.phase,
        passengerData: gameState.passengers[id],
      });
    }
  });
}

function broadcastAll() {
  broadcastToHost();
  broadcastToClerk();
  broadcastToSecurity();
  broadcastToPassengers();
}

function generatePassenger(name) {
  const firstNames   = ["Sarah","James","Emily","Michael","Olivia",
                        "David","Sophia","Daniel","Emma","Lucas"];
  const lastNames    = ["Johnson","Williams","Brown","Taylor","Anderson",
                        "Wilson","Martinez","Thompson","Garcia","Davis"];
  const destinations = ["London Heathrow","Tokyo Haneda","New York JFK",
                        "Sydney Airport","Paris Charles de Gaulle",
                        "Singapore Changi","Dubai International"];

  const firstName   = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName    = lastNames[Math.floor(Math.random()  * lastNames.length)];
  const age         = Math.floor(18 + Math.random() * 50);
  const flightNum   = "AB" + Math.floor(100 + Math.random() * 900);
  const passportNo  = (Math.random().toString(36).substring(2,4) +
                      Math.floor(100000 + Math.random() * 900000)).toUpperCase();
  const destination = destinations[Math.floor(Math.random() * destinations.length)];
  const seat        = (Math.floor(1 + Math.random() * 30)) +
                      ["A","B","C","D","E","F"][Math.floor(Math.random() * 6)];

  const luggageScenarios = [
    { type:"single", bags:1, carryOn:false,
      weights:[Math.floor(10+Math.random()*13)],
      description:"1 checked bag" },
    { type:"double", bags:2, carryOn:false,
      weights:[Math.floor(10+Math.random()*13), Math.floor(10+Math.random()*13)],
      description:"2 checked bags" },
    { type:"carryon", bags:1, carryOn:true,
      weights:[Math.floor(10+Math.random()*13)],
      carryOnWeight:Math.floor(5+Math.random()*5),
      description:"1 checked bag + 1 carry-on" },
    { type:"overweight", bags:1, carryOn:false,
      weights:[Math.floor(24+Math.random()*8)],
      description:"1 overweight bag", overweight:true },
    { type:"double_overweight", bags:2, carryOn:false,
      weights:[Math.floor(24+Math.random()*8), Math.floor(10+Math.random()*13)],
      description:"2 bags, 1 overweight", overweight:true },
  ];
  const luggage = luggageScenarios[Math.floor(Math.random() * luggageScenarios.length)];

  // Security scenario - generated HERE, not in connection handler
  const flaggedPool   = ["water","scissors","lighter"];
  const numFlagged    = Math.floor(Math.random() * 2);
  const randomFlagged = flaggedPool
    .sort(() => Math.random() - 0.5)
    .slice(0, numFlagged);

  const securityScenario = {
    forgotBelt:   Math.random() > 0.5,
    forgotShoes:  Math.random() > 0.6,
    hasLaptop:    Math.random() > 0.4,
    flaggedItems: randomFlagged,
  };

  const items = {
    passport: { label:"Passport", emoji:"🛂", owned:true,  sent:false, inTray:false, category:"checkin" },
    luggage:  { label:"Luggage",  emoji:"🧳", owned:true,  sent:false, inTray:false, category:"checkin" },
    carryOn:  { label:"Carry-on", emoji:"🎒", owned:luggage.carryOn, sent:false, inTray:false, category:"checkin" },
    phone:    { label:"Phone",    emoji:"📱", owned:true,  inTray:false, category:"tray" },
    keys:     { label:"Keys",     emoji:"🔑", owned:true,  inTray:false, category:"tray" },
    coins:    { label:"Coins",    emoji:"🪙", owned:true,  inTray:false, category:"tray" },
    belt:     { label:"Belt",     emoji:"👔", owned:true,  inTray:false, category:"tray" },
    shoes:    { label:"Shoes",    emoji:"👟", owned:true,  inTray:false, category:"tray" },
    laptop:   { label:"Laptop",   emoji:"💻",
                owned: securityScenario.hasLaptop, inTray:false, category:"tray" },
    water:    { label:"Water",    emoji:"💧",
                owned: randomFlagged.includes("water"),
                inTray:false, category:"flagged", flagReason:"No liquids over 100ml!" },
    scissors: { label:"Scissors", emoji:"✂️",
                owned: randomFlagged.includes("scissors"),
                inTray:false, category:"flagged", flagReason:"Sharp objects not allowed!" },
    lighter:  { label:"Lighter",  emoji:"🔥",
                owned: randomFlagged.includes("lighter"),
                inTray:false, category:"flagged", flagReason:"Lighters are restricted!" },
  };

  return {
    name: name || "Alex",
    identity: {
      firstName, lastName,
      fullName: `${firstName} ${lastName}`,
      age:      age.toString(),
      flightNum, passportNo, destination, seat,
    },
    luggage,
    securityScenario,
    items,
    boardingPass: null,
  };
}

// ── Reset helpers ────────────────────────────────────────────
function resetCheckin() {
  gameState.checkin = freshCheckin();
  gameState.log     = [];
  gameState.phase   = "waiting";
}

function resetSecurity() {
  gameState.securityState = freshSecurity();
}

// ── Socket Events ────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Host ──────────────────────────────────────────────
  socket.on("join_host", () => {
    gameState.host            = socket.id;
    gameState.roles[socket.id] = "host";
    socket.emit("joined", { role: "host" });
    broadcastToHost();
  });

  // ── Select Scenario ───────────────────────────────────
  socket.on("select_scenario", ({ scenario }) => {
    if (gameState.roles[socket.id] !== "host") return;
    gameState.scenario = scenario;
    gameState.phase    = "waiting";
    addLog(`📋 Scenario selected: ${scenario}`, "info");
    broadcastAll();
    io.emit("scenario_selected", { scenario });
  });

  // ── Join Player ───────────────────────────────────────
  socket.on("join_player", ({ name }) => {
    // Already assigned
    if (gameState.roles[socket.id]) {
      const role = gameState.roles[socket.id];
      socket.emit("joined", {
        role,
        name,
        passengerData: role === "passenger"
          ? gameState.passengers[socket.id] : null,
      });
      return;
    }

    const takenRoles = Object.values(gameState.roles);
    const scenario   = gameState.scenario || "checkin";
    let assignedRole = "";

    if (!takenRoles.includes("passenger")) {
      assignedRole = "passenger";
      // Generate full passenger data HERE (fixes the crash!)
      gameState.passengers[socket.id] = generatePassenger(name);

    } else if (scenario === "security" && !takenRoles.includes("security")) {
      assignedRole = "security";
      gameState.security = socket.id;

    } else if (scenario === "checkin" && !takenRoles.includes("clerk")) {
      assignedRole = "clerk";
      gameState.clerk = socket.id;

    } else {
      socket.emit("error_msg", { msg: "Room is full!" });
      return;
    }

    gameState.roles[socket.id] = assignedRole;
    socket.emit("joined", {
      role: assignedRole,
      name,
      passengerData: assignedRole === "passenger"
        ? gameState.passengers[socket.id] : null,
    });

    addLog(`✅ ${name} joined as ${assignedRole}`, "success");

    // Auto-start
    const newRoles  = Object.values(gameState.roles);
    const readyCI   = newRoles.includes("passenger") && newRoles.includes("clerk");
    const readySec  = newRoles.includes("passenger") && newRoles.includes("security");

    if ((scenario === "checkin"  && readyCI) ||
        (scenario === "security" && readySec)) {
      gameState.phase = scenario;
      addLog(`🎬 ${scenario} scenario started!`, "success");
      broadcastAll();
    } else {
      broadcastAll();
    }
  });

  // ── Security Actions ──────────────────────────────────
  socket.on("security_action", ({ action, data }) => {
    if (gameState.roles[socket.id] !== "security") return;
    const sc = gameState.securityState;

    switch (action) {

      case "request_tray": {
        sc.trayRequested = true;
        addLog("👮 Officer: Please place all items in the tray!", "action");
        broadcastToPassengers();
        broadcastToSecurity();
        io.to(socket.id).emit("state_update", {
          securityState: sc, phase: gameState.phase
        });
        break;
      }

      case "request_laptop_tray": {
        sc.laptopTrayRequested = true;
        addLog("👮 Officer: Laptop needs a separate tray!", "action");
        broadcastToPassengers();
        broadcastToSecurity();
        break;
      }

      case "start_scan": {
        sc.scanStarted = true;
        addLog("👮 Officer: Please walk through the scanner!", "action");
        broadcastAll();

        const passenger = Object.values(gameState.passengers)[0];
        const scenario  = passenger?.securityScenario;
        const items     = passenger?.items;

        setTimeout(() => {
          const beepReasons = [];

          if (scenario?.forgotBelt  && !items?.belt?.inTray)  beepReasons.push("belt");
          if (scenario?.forgotShoes && !items?.shoes?.inTray) beepReasons.push("shoes");
          if (items?.coins?.owned   && !items?.coins?.inTray) beepReasons.push("coins");

          // Check flagged items
          ["water","scissors","lighter"].forEach(key => {
            if (items?.[key]?.owned && items?.[key]?.inTray && !items?.[key]?.confiscated) {
              beepReasons.push(key);
            }
          });

          if (beepReasons.length > 0) {
            sc.beeped     = true;
            sc.beepReason = beepReasons[0];
            addLog(`🚨 BEEP! Scanner detected: ${beepReasons.join(", ")}!`, "warning");
            io.to(socket.id).emit("scanner_beep", { reasons: beepReasons });

            const pSock = Object.entries(gameState.roles).find(([,r]) => r === "passenger");
            if (pSock) io.to(pSock[0]).emit("you_beeped", { reasons: beepReasons });
          } else {
            sc.cleared        = true;
            gameState.phase   = "complete";
            addLog("✅ All clear! Passenger may proceed!", "success");
            io.to(socket.id).emit("scanner_clear");

            const pSock = Object.entries(gameState.roles).find(([,r]) => r === "passenger");
            if (pSock) io.to(pSock[0]).emit("security_cleared");
          }
          broadcastAll();
        }, 3000);
        break;
      }

      case "confiscate_item": {
        const p = Object.values(gameState.passengers)[0];
        if (p?.items[data.itemKey]) {
          p.items[data.itemKey].confiscated = true;
          addLog(`🚫 ${data.itemKey} confiscated!`, "warning");
          const pSock = Object.entries(gameState.roles).find(([,r]) => r === "passenger");
          if (pSock) {
            io.to(pSock[0]).emit("item_confiscated", {
              itemKey: data.itemKey,
              reason:  p.items[data.itemKey].flagReason,
            });
          }
        }
        broadcastAll();
        break;
      }

      case "wand_check": {
        sc.wandChecked = true;
        addLog("👮 Officer uses handheld scanner...", "action");
        broadcastAll();

        setTimeout(() => {
          const p3       = Object.values(gameState.passengers)[0];
          const items3   = p3?.items;
          const forgotten = [];
          if (items3?.belt?.owned  && !items3?.belt?.inTray)  forgotten.push("belt");
          if (items3?.coins?.owned && !items3?.coins?.inTray) forgotten.push("coins");

          if (forgotten.length > 0) {
            io.to(socket.id).emit("wand_found", { items: forgotten });
            addLog(`🔍 Wand found: ${forgotten.join(", ")}`, "warning");
          } else {
            sc.cleared      = true;
            gameState.phase = "complete";
            io.to(socket.id).emit("wand_clear");
            addLog("✅ Wand check clear! Proceed!", "success");
            const pSock = Object.entries(gameState.roles).find(([,r]) => r === "passenger");
            if (pSock) io.to(pSock[0]).emit("security_cleared");
          }
          broadcastAll();
        }, 2000);
        break;
      }

      case "put_in_tray": {
        const p4 = Object.values(gameState.passengers)[0];
        if (p4?.items[data.itemKey]) {
          p4.items[data.itemKey].inTray = true;
          sc.itemsInTray.push(data.itemKey);
          addLog(`📦 ${data.itemKey} placed in tray`, "action");

          // Notify security of item in tray
          io.to(socket.id).emit("item_in_tray", {
            itemKey: data.itemKey,
            item:    p4.items[data.itemKey],
          });

          // Check for flagged items
          if (p4.items[data.itemKey].category === "flagged") {
            io.to(socket.id).emit("item_in_tray", {
              itemKey: data.itemKey,
              item:    p4.items[data.itemKey],
            });
          }
        }
        broadcastAll();
        break;
      }
    }
  });

  // ── Passenger Actions ─────────────────────────────────
  socket.on("passenger_action", ({ action, data }) => {
    if (gameState.roles[socket.id] !== "passenger") return;
    const ci    = gameState.checkin;
    const pData = gameState.passengers[socket.id];
    if (!pData) return;

    switch (action) {

      case "send_item": {
        const item = pData.items[data.itemKey];
        if (!item || item.sent) return;

        if (data.itemKey === "passport" &&
            ci.passportRequested && !ci.passportReceived) {
          item.sent            = true;
          ci.passportReceived  = true;
          addLog("🛂 Passenger hands over passport", "action");
          if (gameState.clerk) {
            io.to(gameState.clerk).emit("item_received", {
              itemKey: "passport", item,
            });
          }

        } else if (data.itemKey === "luggage" &&
                   ci.bagsRequested && !ci.bagsOnBelt) {
          item.sent       = true;
          ci.bagsOnBelt   = true;
          addLog("🧳 Passenger puts luggage on belt", "action");
          socket.emit("show_luggage_info", { luggage: pData.luggage, bagIndex: 0 });
          if (gameState.clerk) {
            io.to(gameState.clerk).emit("enter_bag_weight", {
              bagNumber: 1, totalBags: pData.luggage.bags,
              hasCarryOn: pData.luggage.carryOn, bagIndex: 0,
            });
          }

        } else if (data.itemKey === "carryOn" &&
                   ci.bagsOnBelt && !ci.bagsConfirmed) {
          item.sent = true;
          addLog("🎒 Passenger puts carry-on on belt", "action");
          socket.emit("show_luggage_info", { luggage: pData.luggage, bagIndex: "carryOn" });
          if (gameState.clerk) {
            io.to(gameState.clerk).emit("enter_carry_on_weight", {
              carryOnWeight: pData.luggage.carryOnWeight,
            });
          }

        } else {
          socket.emit("item_rejected", {
            itemKey: data.itemKey,
            msg:     "The clerk hasn't asked for that yet!",
          });
        }

        socket.emit("inventory_update", { items: pData.items });
        broadcastAll();
        break;
      }

      case "put_in_tray": {
        const item2 = pData.items[data.itemKey];
        if (!item2 || item2.inTray) return;
        item2.inTray = true;
        gameState.securityState.itemsInTray.push(data.itemKey);
        addLog(`📦 ${data.itemKey} placed in tray`, "action");

        // Notify security officer
        if (gameState.security) {
          io.to(gameState.security).emit("item_in_tray", {
            itemKey: data.itemKey,
            item:    item2,
          });
        }
        socket.emit("inventory_update", { items: pData.items });
        broadcastAll();
        break;
      }
    }
  });

  // ── Clerk Actions ─────────────────────────────────────
  socket.on("clerk_action", ({ action, data }) => {
    if (gameState.roles[socket.id] !== "clerk") return;
    const ci = gameState.checkin;

    switch (action) {

      case "ask_firstname": {
        ci.askingFirstName = true;
        addLog("🧑‍💼 Clerk: What is your first name?", "action");
        broadcastToPassengers(); broadcastToClerk(); break;
      }
      case "check_firstname": {
        const p = Object.values(gameState.passengers)[0];
        const correct = p?.identity?.firstName || "";
        if (data.answer.trim().toLowerCase() === correct.toLowerCase()) {
          ci.firstNameCorrect = true;
          ci.firstNameEntered = data.answer;
          addLog(`✅ First name correct: ${data.answer}`, "success");
          io.to(socket.id).emit("spelling_result", { field:"firstName", correct:true, answer:data.answer });
        } else {
          addLog(`❌ Wrong first name: ${data.answer}`, "warning");
          io.to(socket.id).emit("spelling_result", {
            field:"firstName", correct:false, answer:data.answer,
            hint:`Starts with "${correct[0]}"`,
          });
        }
        broadcastAll(); break;
      }

      case "ask_lastname": {
        ci.askingLastName = true;
        addLog("🧑‍💼 Clerk: What is your last name?", "action");
        broadcastToPassengers(); broadcastToClerk(); break;
      }
      case "check_lastname": {
        const p = Object.values(gameState.passengers)[0];
        const correct = p?.identity?.lastName || "";
        if (data.answer.trim().toLowerCase() === correct.toLowerCase()) {
          ci.lastNameCorrect = true;
          ci.lastNameEntered = data.answer;
          addLog(`✅ Last name correct: ${data.answer}`, "success");
          io.to(socket.id).emit("spelling_result", { field:"lastName", correct:true, answer:data.answer });
        } else {
          addLog(`❌ Wrong last name: ${data.answer}`, "warning");
          io.to(socket.id).emit("spelling_result", {
            field:"lastName", correct:false, answer:data.answer,
            hint:`Starts with "${correct[0]}"`,
          });
        }
        broadcastAll(); break;
      }

      case "ask_age": {
        ci.askingAge = true;
        addLog("🧑‍💼 Clerk: How old are you?", "action");
        broadcastToPassengers(); broadcastToClerk(); break;
      }
      case "check_age": {
        const p = Object.values(gameState.passengers)[0];
        const correct = p?.identity?.age || "";
        if (data.answer.trim() === correct) {
          ci.ageCorrect = true;
          addLog(`✅ Age correct: ${data.answer}`, "success");
          io.to(socket.id).emit("spelling_result", { field:"age", correct:true, answer:data.answer });
        } else {
          addLog(`❌ Wrong age: ${data.answer}`, "warning");
          io.to(socket.id).emit("spelling_result", { field:"age", correct:false, answer:data.answer });
        }
        broadcastAll(); break;
      }

      case "ask_flightnum": {
        ci.askingFlight = true;
        addLog("🧑‍💼 Clerk: What is your flight number?", "action");
        broadcastToPassengers(); broadcastToClerk(); break;
      }
      case "check_flightnum": {
        const p = Object.values(gameState.passengers)[0];
        const correct = p?.identity?.flightNum || "";
        if (data.answer.trim().toUpperCase() === correct.toUpperCase()) {
          ci.flightCorrect = true;
          addLog(`✅ Flight number correct: ${data.answer}`, "success");
          io.to(socket.id).emit("spelling_result", { field:"flightNum", correct:true, answer:data.answer });
        } else {
          addLog(`❌ Wrong flight number: ${data.answer}`, "warning");
          io.to(socket.id).emit("spelling_result", { field:"flightNum", correct:false, answer:data.answer });
        }
        broadcastAll