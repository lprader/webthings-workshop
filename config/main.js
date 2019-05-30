/*
* Copyright (c) 2019  Moddable Tech, Inc.
*
*   This file is part of the Moddable SDK.
*
*   This work is licensed under the
*       Creative Commons Attribution 4.0 International License.
*   To view a copy of this license, visit
*       <http://creativecommons.org/licenses/by/4.0>.
*   or send a letter to Creative Commons, PO Box 1866,
*   Mountain View, CA 94042, USA.
*
*/
import Net from "net";
import SNTP from "sntp";
import WiFi from "wifi";
import Time from "time";
import MDNS from "mdns";
import {Server} from "websocket"
import Preference from "preference";
import Flash from "flash";
import Timer from "timer";
import { WebThingApp, MainScreen, ReadyToRunScreen, RenameDeviceScreen, ConfirmResetScreen } from "screens";
import { WiFiStatusSpinner } from "assets";
import { NetworkListScreen, LoginScreen, ConnectionErrorScreen } from "wifi-screens";

function restart() @ "do_restart";
function doRestart() {
	trace(`Restarting in 1 second...\n`);
    Timer.set(() => {
    	restart();
    }, 1000);
}

function getUniqueName() {
	let mac = Net.get("MAC").replace(/:/g, '');
	return "thing"+mac.substring(6).toLowerCase();
}

function getVariantFromSignalLevel(value) {
	let low = -120;
	let high = -40;
	if (value < low) value = low;
	if (value > high) value = high;
	return Math.round(4 * ((value - low) / (high - low)));
}

class ModDevServer extends Server {
	callback(message, value) {
		if (Server.handshake === message) {
			ModDevServer.debug(this.detach());
		}
		else if (Server.subprotocol === message)
			return "x-xsbug";
	}
	static debug(socket) @ "xs_debug";		// hand-off native socket to debugger
}
Object.freeze(ModDevServer.prototype);

const CONNECTING_MSG = "Connecting to Wi-Fi...";
const NOT_CONFIGURED_MSG = "Wi-Fi not configured";

class AppBehavior extends Behavior {
	onCreate(app, data) {
		trace(`host ready on serial\n`);
		this.data = data;
		global.hostName = Preference.get("config", "name") || getUniqueName();
		let ssid = Preference.get("wifi", "ssid");
		if (undefined !== ssid) {
			this.data.ssid = CONNECTING_MSG;
			let wifiData = { ssid };
			let password = Preference.get("wifi", "password")
			if (undefined !== password) {
				wifiData.password=password;
			}
			this.timeout = Date.now() + 10000;
			global.monitor = new WiFi(wifiData, message => {
				trace("message: "+message+"\n");
				if (message == "gotIP"){
					trace(Net.get("IP")+"\n");
				  	Net.resolve("pool.ntp.org", (name, host) => {
						if (!host) {
							trace("Unable to resolve sntp host\n");
							application.first.distribute("onWiFiUpdate", NOT_CONFIGURED_MSG);
							return;
						}
						//trace(`resolved ${name} to ${host}\n`);
						application.behavior.timeout = Date.now() + 10000;
						let sntp = new SNTP({host}, (message, value) => {
							if (1 == message) {
								trace("Connected to Wi-Fi.\n");
								application.delegate("setupServer");
								Time.set(value);
								delete application.behavior.timeout;
								this.data.ssid = ssid;
								application.first.distribute("onWiFiUpdate", ssid);
							} else if (-1 == message) {
								trace("Unable to retrieve time\n");
								this.data.ssid = NOT_CONFIGURED_MSG;
								application.first.distribute("onWiFiUpdate", NOT_CONFIGURED_MSG);
							} else {
								return;
							}
						});
					});
					return;
				} else if (message == "disconnect") {
					return;
				}
			});
		} else {
			this.data.ssid = NOT_CONFIGURED_MSG;
		}
		application.delegate("doNext", "MAIN");
		application.interval = 2000;
		application.start();
	}
	onTimeChanged(application) {
		let now = Date.now();
		if ((this.timeout) && (now > this.timeout)) {
			trace("Attempt to connect to Wi-Fi timed out\n");
			if (global.monitor) {
				global.monitor.close();
				global.monitor = undefined;
			}
			WiFi.connect();
			if ("MAIN" === this.curr) {
				application.first.distribute("onWiFiUpdate", NOT_CONFIGURED_MSG);
			} else if ("CONNECTING" === this.curr) {
				application.delegate("doNext", "CONNECTION_ERROR", this.nextScreenData);
			}
			delete this.timeout;
			delete this.nextScreenData;
		}
	}
	doNext(application, nextScreenName, nextScreenData = {}) {
		application.defer("onSwitchScreen", nextScreenName, nextScreenData);
	}
	onSwitchScreen(application, nextScreenName, nextScreenData) {
		if (application.length) application.remove(application.first);
		application.purge();
		switch (nextScreenName) {
			case "MAIN":
			 	application.add(new MainScreen(this.data));
				break;
			case "NAME":
				application.add(new RenameDeviceScreen(nextScreenData));
				break;
			case "RUN":
				application.add(new ReadyToRunScreen(this.data));
				break;
			case "RESET":
				application.add(new ConfirmResetScreen(this.data));
				break;
			case "WIFI":
			case "NETWORK_LIST_SCAN":
				if (undefined === this.networks) {
					application.add(new WiFiStatusSpinner({ status: "Finding networks..." }));
					this.scan(application, true);
				} else {
					application.add(new NetworkListScreen({networks: this.networks}));
				}
				break;
			case "NETWORK_LIST":
				application.add(new NetworkListScreen(nextScreenData));
				break;
			case "LOGIN":
				application.add(new LoginScreen(nextScreenData));
				break;
			case "CONNECTING":
				WiFi.connect();
				application.add(new WiFiStatusSpinner({ status: "Joining network..." }));
				this.timeout = Date.now() + 10000;
				this.nextScreenData = nextScreenData;
				global.monitor = new WiFi(nextScreenData, message => {
					trace("message: "+message+"\n");
					if (message == "gotIP"){
					  	Net.resolve("pool.ntp.org", (name, host) => {
							if (!host) {
								trace("Unable to resolve sntp host\n");
								application.delegate("doNext", "CONNECTION_ERROR", nextScreenData);
								return;
							}
							// trace(`resolved ${name} to ${host}\n`);
							global.application.behavior.timeout = Date.now() + 10000;
							let sntp = new SNTP({host}, (message, value) => {
								if (1 == message) {
									trace("Connected to Wi-Fi.\n");
									application.delegate("setupServer");
									Time.set(value);
									delete global.application.behavior.timeout;
									application.delegate("saveWiFiCredentials", nextScreenData.ssid, nextScreenData.password);
									application.delegate("doNext", "MAIN");
								} else if (-1 == message) {
									trace("Unable to retrieve time\n");
									application.delegate("doNext", "CONNECTION_ERROR", nextScreenData);
								} else {
									return;
								}
							});
						});
						return;
					} else if (message == "disconnect") {
						return;
					}
				});
				break;
			case "CONNECTION_ERROR":
				application.add(new ConnectionErrorScreen(nextScreenData));
				break;
		}
		this.curr = nextScreenName;
	}
	scan(app, isFirstScan) {
		if (global.monitor) {
			global.monitor.close();
			global.monitor = undefined;
		}
		WiFi.scan({}, item => {
			let networks = application.behavior.networks;
			if (item) {
				let strength = getVariantFromSignalLevel(item.rssi);
				for (let walker = networks; walker; walker = walker.next) {
					if (walker.ssid === item.ssid) {
						if (strength > Math.abs(walker.variant))
							walker.variant = strength * Math.sign(walker.variant);
						return;
					}
				}
				let ap = { ssid: item.ssid, variant: (item.authentication === "none") ? -strength : strength, next: networks };
				application.behavior.networks = ap;
			} else {
				if (isFirstScan) application.delegate("doNext", "NETWORK_LIST", { networks });
				else application.first.distribute("onUpdateNetworkList", networks);
			}
		});
	}
	renameDevice(app, name) {
		Preference.set("config", "name", name);
		doRestart()
	}
	saveWiFiCredentials(app, ssid, password) {
		this.data.ssid = ssid;
		Preference.set("wifi", "ssid", ssid);
		Preference.set("wifi", "password", password);
	}
	resetPreferences(app) {
		Preference.delete("wifi", "ssid");
		Preference.delete("wifi", "password");
		Preference.delete("config", "name");
		let flash = new Flash("xs");
		let buffer = flash.read(4, 8);
		let val = String.fromArrayBuffer(buffer);
		if ("XS_A" == val) {
			flash.erase(0);
		}
		doRestart()
	}
	setupServer(app) {
		global.server = new ModDevServer({port: 8080});
		global.mdns = new MDNS({hostName}, function(message, value) {
			if ((1 === message) && value)
				trace(`host ready at ws://${hostName}.local:8080\n`);
		});
	}
}
Object.freeze(AppBehavior.prototype);

export default function() {
	return new WebThingApp({}, { Behavior: AppBehavior });
}
