// ============================================================
//  AIRPORT GAME — Offline Engine (replaces server.js)
//  Uses localStorage + StorageEvent for cross-tab communication
// ============================================================

const AirportGame = (() => {

  // ── Helpers ─────────────────────────────────────────────
  function getState() {
    try {
      return JSON.parse(localStorage.getItem("airportGame")) || defaultState();
    } catch { return defaultState(); }
  }

  function saveState(state) {
    localStorage.setItem("airportGame", JSON.stringify(state));
    // Trigger cross-tab update
    localStorage.setItem("airportGame_ping", Date.now().toString());
  }

  function defaultState() {
    return {
      phase: "waiting",
      scenario: "checkin",
      roles: {},          // { tabId: "passenger"|"clerk"|"security"|"host" }
      passengers: {},     // { tabId: passengerData }
      log: [],
      checkin: defaultCheckin(),
      securityState: defaultSecurity(),
    };
  }

  function defaultCheckin() {
    return {
      passportRequested: false, passportReceived: false,
      passportValid: false, bagsRequested: false,
      bagsOnBelt: false, bagsConfirmed: false,
      bagCount: 0, bagWeight: 0,
      seatAssigned: false, seatType: "", boardingPassIssued: false,
      overweightBag: false, overweightFee: 0, overweightFeePaid: false,
      askingFirstName: false, firstNameCorrect: false, firstNameEntered: "",
      askingLastName: false,  lastNameCorrect: false,  lastNameEntered: "",
      askingAge: false,       ageCorrect: false,
      askingFlight: false,    flightCorrect: false,
      askingPassportNo: false, passportNoCorrect: false,
      askingDestination: false, destinationCorrect: false, destinationEntered: "",
    };
  }

  function defaultSecurity() {
    return {
      trayRequested: false, laptopTrayRequested: false,
      itemsInTray: [], scanStarted: false,
      beeped: false, beepReason: "", wandChecked: false, cleared: false,
    };
  }

  function addLog(state, message, type = "info") {
    const entry = {
      message, type,
      time: new Date().toLocaleTimeString(),
    };
    state.log.unshift(entry);
    if (state.log.length > 8) state.log.pop();
  }

  // ── Passenger Data Generator ────────────────────────────
  function generatePassenger(name) {
    const firstNames = ["Sarah","James","Emily","Michael","Olivia",
                        "David","Sophia","Daniel","Emma","Lucas"];
    const lastNames  = ["Johnson","Williams","Brown","Taylor","Anderson",
                        "Wilson","Martinez","Thompson","Garcia","Davis"];
    const destinations = [
      "London Heathrow","Tokyo Haneda","New York JFK",
      "Sydney Airport","Paris Charles de Gaulle",
      "Singapore Changi","Dubai International"
    ];

    const firstName   = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName    = lastNames[Math.floor(Math.random() * lastNames.length)];
    const age         = Math.floor(18 + Math.random() * 50);
    const flightNum   = "AB" + Math.floor(100 + Math.random() * 900);
    const passportNo  = (Math.random().toString(36).substring(2,4) +
                        Math.floor(100000 + Math.random() * 900000)).toUpperCase();
    const destination = destinations[Math.floor(Math.random() * destinations.length)];
    const seat        = (Math.floor(1 + Math.random() * 30)) +
                        ["A","B","C","D","E","F"][Math.floor(Math.random() * 6)];

    const luggageScenarios = [
      { type: "single",           bags: 1, carryOn: false,
        weights: [Math.floor(10 + Math.random() * 13)],
        description: "1 checked bag" },
      { type: "double",           bags: 2, carryOn: false,
        weights: [Math.floor(10 + Math.random() * 13), Math.floor(10 + Math.random() * 13)],
        description: "2 checked bags" },
      { type: "carryon",          bags: 1, carryOn: true,
        weights: [Math.floor(10 + Math.random() * 13)],
        carryOnWeight: Math.floor(5 + Math.random() * 5),
        description: "1 checked bag + 1 carry-on" },
      { type: "overweight",       bags: 1, carryOn: false,
        weights: [Math.floor(24 + Math.random() * 8)],
        description: "1 overweight bag", overweight: true },
      { type: "double_overweight", bags: 2, carryOn: false,
        weights: [Math.floor(24 + Math.random() * 8), Math.floor(10 + Math.random() * 13)],
        description: "2 bags, 1 overweight", overweight: true },
    ];
    const luggage = luggageScenarios[Math.floor(Math.random() * luggageScenarios.length)];

    // Flagged items (0 or 1)
    const flaggedPool = ["water","scissors","lighter"];
    const numFlagged  = Math.floor(Math.random() * 2);
    const randomFlagged = flaggedPool
      .sort(() => Math.random() - 0.5)
      .slice(0, numFlagged);

    // Security scenario
    const securityScenario = {
      forgotBelt:   Math.random() > 0.5,
      forgotShoes:  Math.random() > 0.6,
      hasLaptop:    Math.random() > 0.4,
      flaggedItems: randomFlagged,
    };

    const items = {
      passport: { label:"Passport",  emoji:"🛂", owned:true,  sent:false, inTray:false, category:"checkin" },
      luggage:  { label:"Luggage",   emoji:"🧳", owned:true,  sent:false, inTray:false, category:"checkin" },
      carryOn:  { label:"Carry-on",  emoji:"🎒", owned:luggage.carryOn, sent:false, inTray:false, category:"checkin" },
      phone:    { label:"Phone",     emoji:"📱", owned:true,  inTray:false, category:"tray" },
      keys:     { label:"Keys",      emoji:"🔑", owned:true,  inTray:false, category:"tray" },
      coins:    { label:"Coins",     emoji:"🪙", owned:true,  inTray:false, category:"tray" },
      belt:     { label:"Belt",      emoji:"👔", owned:true,  inTray:false, category:"tray" },
      shoes:    { label:"Shoes",     emoji:"👟", owned:true,  inTray:false, category:"tray" },
      laptop:   { label:"Laptop",    emoji:"💻", owned:securityScenario.hasLaptop, inTray:false, category:"tray" },
      water:    { label:"Water",     emoji:"💧", owned:randomFlagged.includes("water"),
                  inTray:false, category:"flagged", flagReason:"No liquids over 100ml!" },
      scissors: { label:"Scissors",  emoji:"✂️", owned:randomFlagged.includes("scissors"),
                  inTray:false, category:"flagged", flagReason:"Sharp objects not allowed!" },
      lighter:  { label:"Lighter",   emoji:"🔥", owned:randomFlagged.includes("lighter"),
                  inTray:false, category:"flagged", flagReason:"Lighters are restricted!" },
    };

    return {
      name: name || "Alex",
      identity: { firstName, lastName, fullName:`${firstName} ${lastName}`,
                  age: age.toString(), flightNum, passportNo, destination, seat },
      luggage,
      securityScenario,
      items,
      boardingPass: null,
    };
  }

  // ── Tab ID ───────────────────────────────────────────────
  function getTabId() {
    if (!sessionStorage.getItem("tabId")) {
      sessionStorage.setItem("tabId", "tab_" + Math.random().toString(36).substr(2, 8));
    }
    return sessionStorage.getItem("tabId");
  }

  // ── Public API ───────────────────────────────────────────
  return {
    getState,
    saveState,
    defaultState,
    defaultCheckin,
    defaultSecurity,
    addLog,
    generatePassenger,
    getTabId,

    // Subscribe to state changes
    onChange(callback) {
      window.addEventListener("storage", (e) => {
        if (e.key === "airportGame_ping") {
          callback(getState());
        }
      });
      // Also fire on same-tab changes via custom event
      window.addEventListener("gameStateChanged", () => {
        callback(getState());
      });
    },

    // Dispatch same-tab update
    dispatch() {
      window.dispatchEvent(new Event("gameStateChanged"));
    },

    reset() {
      const fresh = defaultState();
      // Keep roles/players but reset game state
      saveState(fresh);
      localStorage.setItem("airportGame_ping", Date.now().toString());
      window.dispatchEvent(new Event("gameStateChanged"));
    },

    fullReset() {
      localStorage.removeItem("airportGame");
      localStorage.removeItem("airportGame_ping");
      sessionStorage.removeItem("tabId");
      sessionStorage.removeItem("playerRole");
      sessionStorage.removeItem("playerName");
    }
  };
})();