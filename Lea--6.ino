
/* =====================================================
   LEA - ACTIVITY 6
   ESP32 + DHT11 + FIREBASE + 2 RELAYS
   CUSTOM WIFI MANAGER + LITTLEFS WEBSITE
   ===================================================== */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <DHT.h>
#include <time.h>

/* ---------------- PIN CONFIGURATION ---------------- */

#define DHT_PIN 4
#define DHT_TYPE DHT11

#define RELAY1_PIN 26
#define RELAY2_PIN 27

#define RELAY_ON LOW
#define RELAY_OFF HIGH

#define SAMPLE_INTERVAL 10000UL

/* ---------------- FIREBASE CONFIG ---------------- */

const char* DATABASE_URL =
  "https://leaa-16562-default-rtdb.europe-west1.firebasedatabase.app";

const char* AP_SSID = "lea esp";

WebServer server(80);
Preferences preferences;
DHT dht(DHT_PIN, DHT_TYPE);

bool relay1State = false;
bool relay2State = false;

unsigned long lastSample = 0;

/* =====================================================
   WIFI PORTAL
   ===================================================== */

void startPortal() {

  Serial.println();
  Serial.println("Starting LEA WiFi Manager...");

  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP);

  bool started = WiFi.softAP(AP_SSID);

  if (started) {
    Serial.println("WiFi Manager AP started!");
    Serial.print("WiFi Name: ");
    Serial.println(AP_SSID);
    Serial.print("Open this address: http://");
    Serial.println(WiFi.softAPIP());
  } else {
    Serial.println("Failed to start WiFi AP.");
  }

  server.stop();

  server.on("/", HTTP_GET, []() {
    if (LittleFS.exists("/wifi.html")) {
      File file = LittleFS.open("/wifi.html", "r");
      server.streamFile(file, "text/html");
      file.close();
    } else {
      server.send(404, "text/plain", "wifi.html missing");
    }
  });

  server.on("/save", HTTP_POST, []() {

    String ssid = server.arg("ssid");
    String pass = server.arg("pass");

    ssid.trim();

    if (ssid.length() == 0) {
      server.send(400, "text/plain", "WiFi name is required.");
      return;
    }

    if (pass.length() > 0 && pass.length() < 8) {
      server.send(400, "text/plain",
                  "WiFi password must have at least 8 characters.");
      return;
    }

    preferences.begin("lea-wifi", false);
    preferences.putString("ssid", ssid);
    preferences.putString("pass", pass);
    preferences.putBool("portal", false);
    preferences.end();

    server.send(200, "text/html",
      "<html><body style='font-family:Arial;text-align:center;"
      "background:#0b1220;color:white;padding:40px'>"
      "<h2>WiFi Settings Saved!</h2>"
      "<p>Lea's ESP32 is restarting and connecting to your WiFi.</p>"
      "</body></html>");

    delay(2000);
    ESP.restart();
  });

  server.onNotFound([]() {
    server.sendHeader("Location", "http://192.168.4.1/");
    server.send(302, "text/plain", "");
  });

  server.begin();

  while (true) {
    server.handleClient();
    delay(2);
  }
}

/* =====================================================
   CONNECT TO SAVED WIFI
   ===================================================== */

void initializeWiFi() {

  preferences.begin("lea-wifi", false);

  bool portalRequested =
    preferences.getBool("portal", false);

  String ssid =
    preferences.getString("ssid", "");

  String pass =
    preferences.getString("pass", "");

  preferences.end();

  if (portalRequested || ssid.length() == 0) {
    startPortal();
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());

  Serial.print("Connecting to WiFi");

  unsigned long startTime = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - startTime < 25000) {

    Serial.print(".");
    delay(500);
  }

  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi connection failed. Opening portal...");
    preferences.begin("lea-wifi", false);
    preferences.putBool("portal", true);
    preferences.end();
    startPortal();
  }

  Serial.println("WiFi Connected!");
  Serial.print("Connected WiFi: ");
  Serial.println(WiFi.SSID());
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());
}

/* =====================================================
   TIME CONFIGURATION
   ===================================================== */

void initializeTime() {
  configTime(8 * 3600, 0, "pool.ntp.org", "time.nist.gov");

  Serial.print("Synchronizing time");

  struct tm timeInfo;
  int attempts = 0;

  while (!getLocalTime(&timeInfo) && attempts < 20) {
    Serial.print(".");
    delay(500);
    attempts++;
  }

  Serial.println();
}

/* =====================================================
   FIREBASE UPLOAD
   ===================================================== */

void uploadToFirebase(float temperature, float humidity) {

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Firebase upload skipped: WiFi disconnected.");
    return;
  }

  struct tm timeInfo;

  if (!getLocalTime(&timeInfo)) {
    Serial.println("Cannot get current time.");
    return;
  }

  char dateBuffer[12];
  char timeBuffer[12];

  strftime(dateBuffer, sizeof(dateBuffer),
           "%Y-%m-%d", &timeInfo);

  strftime(timeBuffer, sizeof(timeBuffer),
           "%H:%M:%S", &timeInfo);

  String path =
    String(DATABASE_URL) +
    "/ESP32_Data/" +
    dateBuffer +
    "/" +
    timeBuffer +
    ".json";

  String json = "{";
  json += "\"temperature\":" + String(temperature, 1) + ",";
  json += "\"humidity\":" + String(humidity, 1);
  json += "}";

  WiFiClientSecure secureClient;
  secureClient.setInsecure();

  HTTPClient http;

  if (http.begin(secureClient, path)) {

    http.addHeader("Content-Type", "application/json");

    int responseCode = http.PUT(json);

    Serial.print("Firebase response: ");
    Serial.println(responseCode);

    if (responseCode > 0) {
      Serial.println(http.getString());
    } else {
      Serial.println(http.errorToString(responseCode));
    }

    http.end();

  } else {
    Serial.println("Could not start Firebase request.");
  }
}

/* =====================================================
   SENSOR READING
   ===================================================== */

void readSensor() {

  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("DHT11 reading failed!");
    return;
  }

  Serial.println("------------------------------");

  Serial.print("Temperature: ");
  Serial.print(temperature);
  Serial.println(" C");

  Serial.print("Humidity: ");
  Serial.print(humidity);
  Serial.println(" %");

  uploadToFirebase(temperature, humidity);
}

/* =====================================================
   RELAY CONTROL
   ===================================================== */

void setRelay(int channel, bool state) {

  if (channel == 1) {
    relay1State = state;
    digitalWrite(RELAY1_PIN, state ? RELAY_ON : RELAY_OFF);
  }

  if (channel == 2) {
    relay2State = state;
    digitalWrite(RELAY2_PIN, state ? RELAY_ON : RELAY_OFF);
  }
}

/* =====================================================
   WEBSITE FILE HANDLER
   ===================================================== */

void handleFile(String path, String contentType) {

  if (LittleFS.exists(path)) {

    File file = LittleFS.open(path, "r");
    server.streamFile(file, contentType);
    file.close();

  } else {

    server.send(404, "text/plain",
                "File not found: " + path);
  }
}

/* =====================================================
   WEBSITE ROUTES
   ===================================================== */

void setupWebRoutes() {

  server.on("/", HTTP_GET, []() {
    handleFile("/index.html", "text/html");
  });

  server.on("/style.css", HTTP_GET, []() {
    handleFile("/style.css", "text/css");
  });

  server.on("/app.js", HTTP_GET, []() {
    handleFile("/app.js", "application/javascript");
  });

  server.on("/change-wifi", HTTP_GET, []() {

    preferences.begin("lea-wifi", false);
    preferences.putBool("portal", true);
    preferences.end();

    server.send(200, "text/html",
      "<html><body style='font-family:Arial;text-align:center;"
      "padding:40px'><h2>Opening WiFi Manager...</h2>"
      "<p>Reconnect to the <b>lea esp</b> WiFi after restart.</p>"
      "</body></html>");

    delay(1500);
    ESP.restart();
  });

  server.on("/relay-status", HTTP_GET, []() {

    String json = "{";
    json += "\"relay1\":";
    json += relay1State ? "true" : "false";
    json += ",\"relay2\":";
    json += relay2State ? "true" : "false";
    json += "}";

    server.send(200, "application/json", json);
  });

  server.on("/relay", HTTP_GET, []() {

    int channel = server.arg("ch").toInt();
    String state = server.arg("state");

    if (channel != 1 && channel != 2) {
      server.send(400, "text/plain", "Invalid relay channel.");
      return;
    }

    if (state != "on" && state != "off") {
      server.send(400, "text/plain", "Invalid relay state.");
      return;
    }

    setRelay(channel, state == "on");

    server.send(200, "application/json", "{\"success\":true}");
  });

  server.onNotFound([]() {
    server.send(404, "text/plain", "Page not found.");
  });

  server.begin();

  Serial.println("Website server started.");
}

/* =====================================================
   SETUP
   ===================================================== */

void setup() {

  Serial.begin(115200);

  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);

  setRelay(1, false);
  setRelay(2, false);

  dht.begin();

  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS mount failed!");
  } else {
    Serial.println("LittleFS mounted.");

    Serial.println(
      LittleFS.exists("/index.html") ? "index.html FOUND" : "index.html MISSING"
    );

    Serial.println(
      LittleFS.exists("/style.css") ? "style.css FOUND" : "style.css MISSING"
    );

    Serial.println(
      LittleFS.exists("/app.js") ? "app.js FOUND" : "app.js MISSING"
    );

    Serial.println(
      LittleFS.exists("/wifi.html") ? "wifi.html FOUND" : "wifi.html MISSING"
    );
  }

  initializeWiFi();
  initializeTime();

  setupWebRoutes();

  Serial.println("==============================");
  Serial.println("LEA ACTIVITY 6 READY!");
  Serial.print("Dashboard: http://");
  Serial.println(WiFi.localIP());
  Serial.println("==============================");
}

/* =====================================================
   LOOP
   ===================================================== */

void loop() {

  server.handleClient();

  if (millis() - lastSample >= SAMPLE_INTERVAL) {
    lastSample = millis();
    readSensor();
  }
}