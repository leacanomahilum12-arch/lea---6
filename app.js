
import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";

import {
    getDatabase,
    ref,
    onValue
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js";

/* =========================================
   FIREBASE CONFIGURATION - LEA
========================================= */

const firebaseConfig = {
    apiKey: "AIzaSyDwL0Xf3YArAz_bW1ntZV7xWzgsxxyO82g",
    authDomain: "leaa-16562.firebaseapp.com",
    databaseURL: "https://leaa-16562-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "leaa-16562",
    storageBucket: "lleaa-16562.firebasestorage.app",
    messagingSenderId: "364951684145",
    appId: "1:364951684145:web:d050f211166c5db9c00110",
    measurementId: "G-6BDDQNN76X"
};

/* =========================================
   INITIALIZE FIREBASE
========================================= */

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);
const dataRef = ref(database, "ESP32_Data");

/* =========================================
   GLOBAL VARIABLES
========================================= */

let allSensorData = {};
let selectedDate = "";
let sensorChart = null;

/* =========================================
   DOM ELEMENTS
========================================= */

const statusElement = document.getElementById("firebaseStatus");
const currentTemperature = document.getElementById("currentTemperature");
const currentHumidity = document.getElementById("currentHumidity");
const graphDate = document.getElementById("graphDate");
const historyDate = document.getElementById("historyDate");
const historyBody = document.getElementById("historyTableBody");
const recordCount = document.getElementById("recordCount");
const toggleHistory = document.getElementById("toggleHistory");
const historyContent = document.getElementById("historyContent");

/* =========================================
   FIREBASE STATUS
========================================= */

function setStatus(text, connected) {

    if (!statusElement) return;

    statusElement.textContent = "Firebase Status: " + text;

    statusElement.classList.toggle("status-connected", connected);
    statusElement.classList.toggle("status-error", !connected);
}

/* =========================================
   NUMBER HELPERS
========================================= */

function toNumber(value) {

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {

    if (value === null || value === undefined) {
        return "--";
    }

    return Number(value).toFixed(1);
}

/* =========================================
   GET LATEST READING
========================================= */

function getLatestReading(data) {

    let latest = null;

    const dates = Object.keys(data || {}).sort();

    for (const date of dates) {

        const times = Object.keys(data[date] || {}).sort();

        for (const time of times) {

            const reading = data[date][time];

            if (!reading || typeof reading !== "object") {
                continue;
            }

            const temperature = toNumber(reading.temperature);
            const humidity = toNumber(reading.humidity);

            if (temperature === null && humidity === null) {
                continue;
            }

            latest = {
                date,
                time,
                temperature,
                humidity
            };
        }
    }

    return latest;
}

/* =========================================
   GET DATE LIST
========================================= */

function getDateList(data) {

    return Object.keys(data || {})
        .filter(key =>
            data[key] &&
            typeof data[key] === "object"
        )
        .sort()
        .reverse();
}

/* =========================================
   POPULATE DATE SELECTS
========================================= */

function populateDateSelect() {

    const dates = getDateList(allSensorData);

    [graphDate, historyDate].forEach(select => {

        if (!select) return;

        const previousValue = select.value;

        select.innerHTML = "";

        if (dates.length === 0) {

            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No dates available";
            select.appendChild(option);

            return;
        }

        dates.forEach(date => {

            const option = document.createElement("option");
            option.value = date;
            option.textContent = date;

            select.appendChild(option);
        });

        select.value = dates.includes(previousValue)
            ? previousValue
            : selectedDate;
    });
}

/* =========================================
   UPDATE CURRENT READING
========================================= */

function updateCurrentReading() {

    const latest = getLatestReading(allSensorData);

    if (!latest) {

        currentTemperature.textContent = "-- °C";
        currentHumidity.textContent = "-- %";

        return;
    }

    currentTemperature.textContent =
        formatNumber(latest.temperature) + " °C";

    currentHumidity.textContent =
        formatNumber(latest.humidity) + " %";
}

/* =========================================
   GET READINGS FOR DATE
========================================= */

function getReadingsForDate(date) {

    const result = [];

    if (!date || !allSensorData[date]) {
        return result;
    }

    const dayData = allSensorData[date];

    Object.keys(dayData).sort().forEach(time => {

        const reading = dayData[time];

        if (!reading || typeof reading !== "object") {
            return;
        }

        const temperature = toNumber(reading.temperature);
        const humidity = toNumber(reading.humidity);

        if (temperature === null && humidity === null) {
            return;
        }

        result.push({
            time,
            temperature,
            humidity
        });
    });

    return result;
}

/* =========================================
   UPDATE GRAPH
========================================= */

function updateChart() {

    if (typeof Chart === "undefined") {
        console.error("Chart.js is not loaded.");
        return;
    }

    const date = graphDate ? graphDate.value : selectedDate;
    const readings = getReadingsForDate(date);

    const canvas = document.getElementById("sensorChart");

    if (!canvas) return;

    if (sensorChart) {
        sensorChart.destroy();
        sensorChart = null;
    }

    sensorChart = new Chart(canvas, {

        type: "line",

        data: {

            labels: readings.map(item => item.time),

            datasets: [

                {
                    label: "Temperature (°C)",
                    data: readings.map(item => item.temperature),
                    yAxisID: "temperature",
                    tension: 0.3,
                    borderWidth: 3,
                    pointRadius: 4,
                    borderColor: "#5ee7ff",
                    backgroundColor: "rgba(94,231,255,0.12)"
                },

                {
                    label: "Humidity (%)",
                    data: readings.map(item => item.humidity),
                    yAxisID: "humidity",
                    tension: 0.3,
                    borderWidth: 3,
                    pointRadius: 4,
                    borderColor: "#7774ff",
                    backgroundColor: "rgba(119,116,255,0.12)"
                }

            ]
        },

        options: {

            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            plugins: {
                legend: {
                    labels: {
                        color: "#cbd7e7"
                    }
                }
            },

            scales: {

                x: {
                    ticks: { color: "#8192ad" },
                    grid: { color: "#202f46" }
                },

                temperature: {
                    type: "linear",
                    position: "left",
                    ticks: { color: "#5ee7ff" },
                    title: {
                        display: true,
                        text: "Temperature (°C)",
                        color: "#5ee7ff"
                    },
                    grid: { color: "#202f46" }
                },

                humidity: {
                    type: "linear",
                    position: "right",
                    ticks: { color: "#7774ff" },
                    title: {
                        display: true,
                        text: "Humidity (%)",
                        color: "#7774ff"
                    },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

/* =========================================
   UPDATE HISTORY
========================================= */

function updateHistory() {

    if (!historyBody) return;

    const date = historyDate ? historyDate.value : selectedDate;
    const readings = getReadingsForDate(date);

    historyBody.innerHTML = "";

    if (readings.length === 0) {

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 3;
        cell.textContent = "No sensor data available.";

        row.appendChild(cell);
        historyBody.appendChild(row);

        recordCount.textContent = "0 records";

        return;
    }

    readings.slice().reverse().forEach(reading => {

        const row = document.createElement("tr");

        const timeCell = document.createElement("td");
        const temperatureCell = document.createElement("td");
        const humidityCell = document.createElement("td");

        timeCell.textContent = reading.time;

        temperatureCell.textContent =
            formatNumber(reading.temperature) + " °C";

        humidityCell.textContent =
            formatNumber(reading.humidity) + " %";

        row.append(timeCell, temperatureCell, humidityCell);
        historyBody.appendChild(row);
    });

    recordCount.textContent =
        readings.length +
        (readings.length === 1 ? " record" : " records");
}

/* =========================================
   UPDATE DASHBOARD
========================================= */

function updateDashboard() {

    const dates = getDateList(allSensorData);

    if (dates.length === 0) {

        currentTemperature.textContent = "-- °C";
        currentHumidity.textContent = "-- %";

        populateDateSelect();
        updateChart();
        updateHistory();

        return;
    }

    if (!selectedDate || !dates.includes(selectedDate)) {
        selectedDate = dates[0];
    }

    populateDateSelect();
    updateCurrentReading();
    updateChart();
    updateHistory();
}

/* =========================================
   FIREBASE LISTENER
========================================= */

console.log("=================================");
console.log("LEA ACTIVITY 6");
console.log("CONNECTING TO FIREBASE");
console.log("Database: /ESP32_Data");
console.log("=================================");

setStatus("Connecting...", false);

onValue(

    dataRef,

    snapshot => {

        console.log("FIREBASE DATA RECEIVED");

        allSensorData = snapshot.val() || {};

        setStatus("Connected", true);

        updateDashboard();
    },

    error => {

        console.error("FIREBASE READ ERROR:", error);

        setStatus("Error: " + error.message, false);
    }
);

/* =========================================
   GRAPH DATE CHANGE
========================================= */

graphDate.addEventListener("change", function () {

    selectedDate = this.value;

    historyDate.value = selectedDate;

    updateChart();
    updateHistory();
});

/* =========================================
   HISTORY DATE CHANGE
========================================= */

historyDate.addEventListener("change", function () {

    selectedDate = this.value;

    graphDate.value = selectedDate;

    updateHistory();
    updateChart();
});

/* =========================================
   SHOW / HIDE HISTORY
========================================= */

toggleHistory.addEventListener("click", function () {

    if (historyContent.classList.contains("hidden")) {

        historyContent.classList.remove("hidden");
        toggleHistory.textContent = "Hide History";

        updateHistory();

    } else {

        historyContent.classList.add("hidden");
        toggleHistory.textContent = "Show History";
    }
});

/* =========================================
   RELAY CONTROL
========================================= */

async function loadRelayStatus() {

    try {

        const response = await fetch("/relay-status");

        if (!response.ok) {
            throw new Error("Could not get relay status.");
        }

        const data = await response.json();

        updateRelayDisplay(1, data.relay1);
        updateRelayDisplay(2, data.relay2);

    } catch (error) {

        console.error("Relay status error:", error);
    }
}

function updateRelayDisplay(channel, isOn) {

    const status = document.getElementById(`relay${channel}Status`);
    const button = document.getElementById(`relay${channel}Button`);

    status.textContent = isOn ? "ON" : "OFF";
    status.classList.toggle("on", isOn);

    button.textContent = isOn ? "TURN OFF" : "TURN ON";
}

window.toggleRelay = async function(channel) {

    const status = document.getElementById(`relay${channel}Status`);
    const currentlyOn = status.textContent === "ON";

    const newState = currentlyOn ? "off" : "on";

    try {

        const response = await fetch(
            `/relay?ch=${channel}&state=${newState}`
        );

        if (!response.ok) {
            throw new Error("Relay command failed.");
        }

        await loadRelayStatus();

    } catch (error) {

        console.error("Relay control error:", error);
        alert("Unable to control relay. Please check your connection.");
    }
};

loadRelayStatus();
setInterval(loadRelayStatus, 3000);

setStatus("Connecting...", false);
