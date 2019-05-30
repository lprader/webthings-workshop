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
import {HorizontalExpandingKeyboard} from "keyboard";
import {KeyboardField} from "common/keyboard";
import ASSETS from "assets";

/* --------------------------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------- */
class KeyboardContainerBehavior extends Behavior {
	onCreate(column, data){
		this.data = data;
		this.addKeyboard();
	}
	onTouchEnded(column){
		if (1 != this.data["KEYBOARD"].length)
			this.addKeyboard();
	}
	addKeyboard() {
		this.data["KEYBOARD"].add(HorizontalExpandingKeyboard(this.data, {
			style: new ASSETS.OpenSans20(), target: this.data["FIELD"], doTransition: true
		}));
	}
}
Object.freeze(KeyboardContainerBehavior.prototype);

const KeyboardContainer = Column.template($ => ({
	left: 0, right: 0, top: 0, bottom: 0, active: true,
	contents:[
		KeyboardField($, {
			anchor: "FIELD", password: false, left: 32, right: 0, top: 0, bottom: 0,
			Skin: ASSETS.WhiteSkin, Style: ASSETS.OpenSans20Left, state: 1, visible: true
		}),
		Container($, {
			anchor: "KEYBOARD", left:0, right:0, bottom:0, height:164, 
			Skin: ASSETS.WhiteSkin
		}),
	],
	Behavior: KeyboardContainerBehavior
}));

class BackArrowBehavior extends Behavior {
	onCreate(content, data) {
		this.data = data;
	}
	onTouchBegan(content, id, x, y, ticks) {
		content.state = 1;
	}
	onTouchEnded(content, id, x, y, ticks) {
		content.state = 0;
		application.delegate("doNext", "MAIN");
	}
}
Object.freeze(BackArrowBehavior.prototype);

class RenameDeviceScreenBehavior extends Behavior {
	onCreate(column, data) {
		this.data = data;
	}
	onKeyboardOK(column, string) {
		trace(`Renaming device to: ${string}\n`);
		application.delegate("renameDevice", string);
		// application.delegate("doNext", "MAIN");
	}
}
Object.freeze(RenameDeviceScreenBehavior.prototype);

export const RenameDeviceScreen = Column.template($ => ({
	left: 0, right: 0, top: 0, bottom: 0, Skin: ASSETS.WhiteSkin,
	contents: [
		new ASSETS.Header({ title: "Name", backArrowBehavior: BackArrowBehavior }),
		KeyboardContainer($),
	],
	Behavior: RenameDeviceScreenBehavior
}));

/* --------------------------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------- */
class RunModBehavior extends Behavior {
	onCreate(container, data) {
		try {
			let newScreen = require("mod");
			container.add(new newScreen(data));
		}
		catch {
			container.add(new ASSETS.Header({ title: "", backArrowBehavior: BackArrowBehavior })),
			container.add(new Label(data, { string: "No app installed" }));
		}
	}
	onTouchEnded(container) {
		application.delegate("doNext", "MAIN", this.data);
	}
}
Object.freeze(RunModBehavior.prototype);

export const ReadyToRunScreen = Container.template($ => ({
	top: 0, bottom: 0, left: 0, right: 0, 
	Skin: ASSETS.WhiteSkin, Style: ASSETS.OpenSans24,
	active: true, Behavior: RunModBehavior
}));

/* --------------------------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------- */
class ButtonBehavior extends Behavior {
	onCreate(button, action) {
		this.action = action;
	}
	onTouchEnded(button) {
		button.container.delegate(this.action);
	}
}
Object.freeze(ButtonBehavior.prototype);

class ResetBehavior extends Behavior {
	onCreate(container, data) {
		this.data = data;
	}
	onConfirm(container) {
		application.delegate("resetPreferences");
	}
	onCancel(container) {
		application.delegate("doNext", "MAIN");
	}
}
Object.freeze(ResetBehavior.prototype);

export const ConfirmResetScreen = Container.template($ => ({
	top: 0, bottom: 0, left: 0, right: 0, Skin: ASSETS.WhiteSkin, Style: ASSETS.OpenSans24,
	contents: [
		Text($, {
			top: 10, left: 20, right: 20,
			string: "Pressing continue will reset Wi-Fi preferences, device name, and uninstall any WebThings examples."
		}),
		Label("onConfirm", {
			height: 50, bottom: 10, left: 20, width: 130,
			Style: ASSETS.WhiteStyle, string: "Continue", Skin: ASSETS.ButtonFillSkin, state: 2,
			active: true, Behavior: ButtonBehavior
		}),
		Label("onCancel", {
			height: 50, bottom: 10, right: 20, width: 130,
			Style: ASSETS.WhiteStyle, string: "Cancel", Skin: ASSETS.ButtonFillSkin, state: 3,
			active: true, Behavior: ButtonBehavior
		}),
	],
	Behavior: ResetBehavior
}));

/* --------------------------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------- */
class ListItemBehavior extends Behavior {
	onTouchEnded(item) {
		application.delegate("doNext", item.name);
	}
}
Object.freeze(ListItemBehavior.prototype);

const ListItem = Container.template($ => ({
	name: $.name, Skin: ASSETS.ButtonFillSkin,
	contents: [
		Content($, {
			left: 20, Skin: $.icon
		}),
		Label($, {
			left: 72, string: $.string, Style: ASSETS.OpenSans20White
		}) 
	],
	active: true, Behavior: ListItemBehavior
}));

const Button = Container.template($ => ({
	name: $.name, Skin: ASSETS.ButtonFillSkin,
	contents: [
		Content($, { Skin: $.icon, state: $.state }),
	],
	active: true, Behavior: ListItemBehavior
}));

class MainScreenBehavior extends Behavior {
	onWiFiUpdate(container, string) {
		container.content("WIFI").last.string = string;
		if ("Wi-Fi not configured" === string) {
			container.content("RUN").active = false;
			container.content("RUN").state = 1;
		} else {
			container.content("RUN").active = true;
			container.content("RUN").state = 2;
		}
	}
}
Object.freeze(MainScreenBehavior.prototype);

export const MainScreen = Container.template($ => ({
	top: 0, bottom: 0, left: 0, right: 0,
	Skin: ASSETS.WhiteSkin, Style: ASSETS.OpenSans24,
	contents: [
		new ListItem({ name: "WIFI", icon: ASSETS.WiFiSkin, string: $.ssid }, { top: 0, left: 0, right: 0, height: 70 }),
		new ListItem({ name: "NAME", icon: ASSETS.DeviceSkin, string: hostName }, { top: 74, left: 0, right: 0, height: 70 }),
		new Button({ name: "RUN", icon: ASSETS.RunSkin }, { bottom: 0, left: 0, height: 92, width: 158, state: Net.get("IP")? 2 : 1, active: Net.get("IP")? true : false }),
		new Button({ name: "RESET", icon: ASSETS.ResetSkin }, { bottom: 0, right: 0, height: 92, width: 158, state: 3 }),
	],
	Behavior: MainScreenBehavior
}));

export const WebThingApp = Application.template($ => ({
	commandListLength: 2048, displayListLength: 6500, touchCount: 1,
	Skin: ASSETS.WhiteSkin, Style: ASSETS.OpenSans24,
	contents: [
		Label($, {
			string: "Loading..."
		})
	],
}));
