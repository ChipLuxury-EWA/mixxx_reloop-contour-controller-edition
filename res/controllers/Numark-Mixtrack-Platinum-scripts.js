////////////////////////////////////////////////////////////////////////
// JSHint configuration                                               //
////////////////////////////////////////////////////////////////////////
/* global engine                                                      */
/* global script                                                      */
/* global print                                                       */
/* global midi                                                        */
////////////////////////////////////////////////////////////////////////


/******************
 * CONFIG OPTIONS *
 ******************/

// should wheel be enabled on startup?
var EnableWheel = true;

// should we show time elapsed by default? (otherwise time remaining will be shown)
var ShowTimeElapsed = true;

// should we use the manual loop buttons as cue buttons?
var UseManualLoopAsCue = false;

// should we use the auto loop buttons as cue buttons?
var UseAutolLoopAsCue = false;

// should we use the hotcue buttons for samplers 5-8?
var UseCueAsSampler = false;


var MixtrackPlatinum = {};

MixtrackPlatinum.init = function(id, debug) {
    MixtrackPlatinum.id = id;
    MixtrackPlatinum.debug = debug;

    // effects
    MixtrackPlatinum.effects = new components.ComponentContainer();
    MixtrackPlatinum.effects[1] = new MixtrackPlatinum.EffectUnit([1, 3]);
    MixtrackPlatinum.effects[2] = new MixtrackPlatinum.EffectUnit([2, 4]);

    // decks
    MixtrackPlatinum.decks = new components.ComponentContainer();
    MixtrackPlatinum.decks[1] = new MixtrackPlatinum.Deck(1, 0x00, MixtrackPlatinum.effects[1]);
    MixtrackPlatinum.decks[2] = new MixtrackPlatinum.Deck(2, 0x01, MixtrackPlatinum.effects[2]);
    MixtrackPlatinum.decks[3] = new MixtrackPlatinum.Deck(3, 0x02, MixtrackPlatinum.effects[1]);
    MixtrackPlatinum.decks[4] = new MixtrackPlatinum.Deck(4, 0x03, MixtrackPlatinum.effects[2]);

    // set up two banks of samplers, 4 samplers each
    MixtrackPlatinum.sampler_all = new components.ComponentContainer();
    MixtrackPlatinum.sampler_all[1] = new MixtrackPlatinum.Sampler(1);
    MixtrackPlatinum.sampler_all[2] = new MixtrackPlatinum.Sampler(5);

    MixtrackPlatinum.sampler = MixtrackPlatinum.sampler_all[1];
    MixtrackPlatinum.sampler_all[2].forEachComponent(function(component) {
        component.disconnect();
    });


    // headphone gain
    MixtrackPlatinum.head_gain = new MixtrackPlatinum.HeadGain(MixtrackPlatinum.sampler_all);

    // exit demo mode
    var byteArray = [0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x3A, 0x60, 0x00, 0x04, 0x04, 0x01, 0x00, 0x00, 0xF7];
    midi.sendSysexMsg(byteArray, byteArray.length);

    // initialize some leds
    MixtrackPlatinum.effects.forEachComponent(function (component) {
        component.trigger();
    });
    MixtrackPlatinum.decks.forEachComponent(function (component) {
        component.trigger();
    });

    MixtrackPlatinum.browse = new MixtrackPlatinum.BrowseKnob();

    // helper functions
    var led = function(group, key, midi_channel, midino) {
        if (engine.getValue(group, key)) {
            midi.sendShortMsg(0x90 | midi_channel, midino, 0x7F);
        }
        else {
            midi.sendShortMsg(0x80 | midi_channel, midino, 0x00);
        }
    };

    // init a bunch of channel specific leds
    for (var i = 0; i < 4; ++i) {
        var group = "[Channel"+(i+1)+"]";

        // update duration, time elapsed, and the spinner
        var duration = engine.getValue(group, 'duration');
        var position = engine.getValue(group, 'playposition');
        if (duration == 0) position = 0;
        MixtrackPlatinum.positionCallback(position, group, 'playposition');

        // update bpm
        var bpm = engine.getValue(group, 'bpm');
        if (bpm != 0) MixtrackPlatinum.screenBpm(i + 1, Math.round(bpm * 100));

        // keylock indicator
        led(group, 'keylock', i, 0x0D);

        // turn off bpm arrows
        midi.sendShortMsg(0x80 | i, 0x0A, 0x00); // down arrow off
        midi.sendShortMsg(0x80 | i, 0x09, 0x00); // up arrow off

        // slip indicator
        led(group, 'slip_enabled', i, 0x0F);

        // initialize wheel mode (and leds)
        MixtrackPlatinum.wheel[i] = EnableWheel;
        midi.sendShortMsg(0x90 | i, 0x07, EnableWheel ? 0x7F : 0x01);

        // initialize elapsed/remaining mode
        MixtrackPlatinum.show_elapsed[i] = ShowTimeElapsed;
        midi.sendShortMsg(0x90 | i, 0x46, ShowTimeElapsed ? 0x00 : 0x7F);
    }

    // zero vu meters
    midi.sendShortMsg(0xBF, 0x44, 0);
    midi.sendShortMsg(0xBF, 0x45, 0);

    // setup position tracking
    engine.connectControl("[Channel1]", "playposition", MixtrackPlatinum.positionCallback);
    engine.connectControl("[Channel2]", "playposition", MixtrackPlatinum.positionCallback);
    engine.connectControl("[Channel3]", "playposition", MixtrackPlatinum.positionCallback);
    engine.connectControl("[Channel4]", "playposition", MixtrackPlatinum.positionCallback);

    // setup bpm tracking
    engine.connectControl("[Channel1]", "bpm", MixtrackPlatinum.bpmCallback);
    engine.connectControl("[Channel2]", "bpm", MixtrackPlatinum.bpmCallback);
    engine.connectControl("[Channel3]", "bpm", MixtrackPlatinum.bpmCallback);
    engine.connectControl("[Channel4]", "bpm", MixtrackPlatinum.bpmCallback);

    // setup vumeter tracking
    engine.connectControl("[Channel1]", "VuMeter", MixtrackPlatinum.vuCallback);
    engine.connectControl("[Channel2]", "VuMeter", MixtrackPlatinum.vuCallback);
    engine.connectControl("[Channel3]", "VuMeter", MixtrackPlatinum.vuCallback);
    engine.connectControl("[Channel4]", "VuMeter", MixtrackPlatinum.vuCallback);
    engine.connectControl("[Master]", "VuMeterL", MixtrackPlatinum.vuCallback);
    engine.connectControl("[Master]", "VuMeterR", MixtrackPlatinum.vuCallback);
};

MixtrackPlatinum.shutdown = function() {
    // note: not all of this appears to be strictly necessary, things work fine
    // with out this, but other software has been observed sending these led
    // reset messages during shutdown. The last sysex message may be necessary
    // to re-enable demo mode.

    // turn off a bunch of channel specific leds
    for (var i = 0; i < 4; ++i) {
        // pfl/cue button leds
        midi.sendShortMsg(0x90 | i, 0x1B, 0x01);

        // loop leds
        midi.sendShortMsg(0x80 | i + 5, 0x32, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x33, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x34, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x35, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x38, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x39, 0x00);

        // play leds
        midi.sendShortMsg(0x90 | i, 0x00, 0x01);
        midi.sendShortMsg(0x90 | i, 0x04, 0x01);

        // sync leds
        midi.sendShortMsg(0x90 | i, 0x00, 0x02);
        midi.sendShortMsg(0x90 | i, 0x04, 0x03);

        // cue leds
        midi.sendShortMsg(0x90 | i, 0x00, 0x01);
        midi.sendShortMsg(0x90 | i, 0x04, 0x05);

        // hotcue leds
        midi.sendShortMsg(0x80 | i + 5, 0x18, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x19, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x1A, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x1B, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x20, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x21, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x22, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x23, 0x00);

        // auto-loop leds
        midi.sendShortMsg(0x80 | i + 5, 0x14, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x15, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x16, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x17, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x1C, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x1D, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x1E, 0x00);
        midi.sendShortMsg(0x80 | i + 5, 0x1F, 0x00);

        // update spinner and position indicator
        midi.sendShortMsg(0xB0 | i, 0x3F, 0);
        midi.sendShortMsg(0xB0 | i, 0x06, 0);

        // keylock indicator
        midi.sendShortMsg(0x80 | i, 0x0D, 0x00);

        // turn off bpm arrows
        midi.sendShortMsg(0x80 | i, 0x0A, 0x00); // down arrow off
        midi.sendShortMsg(0x80 | i, 0x09, 0x00); // up arrow off

        // turn off slip indicator
        midi.sendShortMsg(0x80 | i, 0x0F, 0x00);

        // turn off wheel button leds
        midi.sendShortMsg(0x80 | i, 0x07, 0x00);
    }

    // dim FX leds
    midi.sendShortMsg(0x98, 0x00, 0x01);
    midi.sendShortMsg(0x98, 0x01, 0x01);
    midi.sendShortMsg(0x98, 0x02, 0x01);
    midi.sendShortMsg(0x99, 0x00, 0x01);
    midi.sendShortMsg(0x99, 0x01, 0x01);
    midi.sendShortMsg(0x99, 0x02, 0x01);

    // turn off sampler leds
    midi.sendShortMsg(0x8F, 0x21, 0x00);
    midi.sendShortMsg(0x8F, 0x22, 0x00);
    midi.sendShortMsg(0x8F, 0x23, 0x00);
    midi.sendShortMsg(0x8F, 0x24, 0x00);

    // zero vu meters
    midi.sendShortMsg(0xBF, 0x44, 0);
    midi.sendShortMsg(0xBF, 0x45, 0);

    // send final shutdown message
    var byteArray = [0xF0, 0x00, 0x20, 0x7F, 0x02, 0xF7];
    midi.sendSysexMsg(byteArray, byteArray.length);
};

MixtrackPlatinum.EffectUnit = function (unitNumbers) {
    var eu = this;

    this.setCurrentUnit = function (newNumber) {
        this.currentUnitNumber = newNumber;
        this.group = '[EffectRack1_EffectUnit' + newNumber + ']';
        this.reconnectComponents(function (component) {
            // update [EffectRack1_EffectUnitX] groups
            var unitMatch = component.group.match(script.effectUnitRegEx);
            if (unitMatch !== null) {
                component.group = eu.group;
            } else {
                // update [EffectRack1_EffectUnitX_EffectY] groups
                var effectMatch = component.group.match(script.individualEffectRegEx);
                if (effectMatch !== null) {
                    component.group = '[EffectRack1_EffectUnit' +
                                      eu.currentUnitNumber +
                                      '_Effect' + effectMatch[2] + ']';
                }
            }
        });
    };

    if (unitNumbers !== undefined) {
        if (Array.isArray(unitNumbers)) {
            this.unitNumbers = unitNumbers;
            this.setCurrentUnit(unitNumbers[0]);
        } else if (typeof unitNumbers === 'number' &&
                  Math.floor(unitNumbers) === unitNumbers &&
                  isFinite(unitNumbers)) {
            this.unitNumbers = [unitNumbers];
            this.setCurrentUnit(unitNumbers);
        }
    } else {
        print('ERROR! new EffectUnit() called without specifying any unit numbers!');
        return;
    }

    this.dryWetKnob = new components.Encoder({
        group: this.group,
        inKey: 'mix',
        input: function (channel, control, value, status, group) {
            if (value === 1) {
                this.inSetParameter(this.inGetParameter() + 0.05);
            } else if (value === 127) {
                this.inSetParameter(this.inGetParameter() - 0.05);
            }
        },
    });

    this.EffectUnitTouchStrip = function() {
        components.Pot.call(this);
        this.firstValueRecived = true;
        this.connect();
    };
    this.EffectUnitTouchStrip.prototype = new components.Pot({
        relative: true, // this disables soft takeover
        connect: function() {
            this.focus_connection = engine.makeConnection(eu.group, "focused_effect", this.onFocusChange);
            this.focus_connection.trigger();
        },
        disconnect: function() {
            this.focus_connection.disconnect();
        },
        onFocusChange: function(value, group, control) {
            if (value === 0) {
                this.group = eu.group;
                this.inKey = 'super1';
            }
            else {
                this.group = '[EffectRack1_EffectUnit' + eu.currentUnitNumber + '_Effect' + value + ']';
                this.inKey = 'meta';
            }
        },
    });

    this.BpmTapButton = function () {
        this.group = '[Channel' + eu.currentUnitNumber + ']';
        this.midi = [0x97 + eu.currentUnitNumber, 0x04];
        components.Button.call(this);
    };
    this.BpmTapButton.prototype = new components.Button({
        type: components.Button.prototype.types.push,
        key: 'bpm_tap',
        off: 0x01,
        connect: function () {
            this.group = '[Channel' + eu.currentUnitNumber + ']';
            components.Button.prototype.connect.call(this);
        },
        input: function (channel, control, value, status, group) {
            components.Button.prototype.input.call(this, channel, control, value, status, group);
            if (this.isPress(channel, control, value, status)) {
                eu.forEachComponent(function (component) {
                    if (component.tap !== undefined) {
                        component.tap();
                    }
                });
            }
            else {
                eu.forEachComponent(function (component) {
                    if (component.untap !== undefined) {
                        component.untap();
                    }
                });
            }
        },
    });

    this.EffectEnableButton = function (number) {
        this.number = number;
        this.group = '[EffectRack1_EffectUnit' + eu.currentUnitNumber +
                      '_Effect' + this.number + ']';
        this.midi = [0x97 + eu.currentUnitNumber, this.number - 1];
        this.inToggle = components.Button.prototype.inToggle;
        this.flash_timer = null;

        components.Button.call(this);
    };
    this.EffectEnableButton.prototype = new components.Button({
        type: components.Button.prototype.types.powerWindow,
        outKey: 'enabled',
        inKey: 'enabled',
        off: 0x01,
        tap: function() {
            this.inKey = 'enabled';
            this.type = components.Button.prototype.types.toggle;
            this.inToggle = this.toggle_focused_effect;
        },
        untap: function() {
            this.type = components.Button.prototype.types.powerWindow;
            this.inToggle = components.Button.prototype.inToggle;
        },
        shift:  function() {
            this.inKey = 'next_effect';
            this.type = components.Button.prototype.types.push;
        },
        unshift: function() {
            this.inKey = 'enabled';
            this.type = components.Button.prototype.types.powerWindow;
        },
        output: function(value, group, control) {
            var focused_effect = engine.getValue(eu.group, "focused_effect");
            if (focused_effect !== this.number) {
                engine.stopTimer(this.flash_timer);
                this.flash_timer = null;
                components.Button.prototype.output.call(this, value, group, control);
            }
            else {
                this.startFlash();
            }
        },
        toggle_focused_effect: function() {
            if (engine.getValue(eu.group, "focused_effect") === this.number) {
                engine.setValue(eu.group, "show_focus", 0);
                engine.setValue(eu.group, "show_parameters", 0);
                engine.setValue(eu.group, "focused_effect", 0);
            }
            else {
                engine.setValue(eu.group, "show_focus", 1);
                engine.setValue(eu.group, "show_parameters", 1);
                engine.setValue(eu.group, "focused_effect", this.number);
            }
        },
        connect: function() {
            components.Button.prototype.connect.call(this);
            this.fx_connection = engine.makeConnection(eu.group, "focused_effect", this.onFocusChange);
        },
        disconnect: function() {
            components.Button.prototype.disconnect.call(this);
            this.fx_connection.disconnect();
        },
        onFocusChange: function(value, group, control) {
            if (value === this.number) {
                this.startFlash();
            }
            else {
                this.stopFlash();
            }
        },
        startFlash: function() {
            // already flashing
            if (this.flash_timer) {
                engine.stopTimer(this.flash_timer);
            }

            this.flash_state = false;
            this.send(this.on);

            var time = 500;
            if (this.inGetValue() > 0) {
                time = 150;
            }

            var button = this;
            this.flash_timer = engine.beginTimer(time, function() {
                if (button.flash_state) {
                    button.send(button.on);
                    button.flash_state = false;
                }
                else {
                    button.send(button.off);
                    button.flash_state = true;
                }
            });
        },
        stopFlash: function() {
            engine.stopTimer(this.flash_timer);
            this.flash_timer = null;
            this.trigger();
        },
    });

    this.touch_strip = new this.EffectUnitTouchStrip();
    this.enableButtons = new components.ComponentContainer();
    for (var n = 1; n <= 3; n++) {
        this.enableButtons[n] = new this.EffectEnableButton(n);
    }

    this.bpmTap = new this.BpmTapButton();

    this.enableButtons.reconnectComponents();

    this.forEachComponent(function (component) {
        if (component.group === undefined) {
            component.group = eu.group;
        }
    });
};
MixtrackPlatinum.EffectUnit.prototype = new components.ComponentContainer();

MixtrackPlatinum.Deck = function(number, midi_chan, effects_unit) {
    var deck = this;
    var eu = effects_unit;
    this.active = (number == 1 || number == 2);

    components.Deck.call(this, number);
    this.play_button = new components.PlayButton({
        midi: [0x90 + midi_chan, 0x00],
        off: 0x01,
        sendShifted: true,
        shiftControl: true,
        shiftOffset: 4,
        unshift: function() {
            components.PlayButton.prototype.unshift.call(this);
            this.type = components.Button.prototype.types.toggle;
        },
        shift: function() {
            this.inKey = 'play_stutter';
            this.type = components.Button.prototype.types.push;
        },
    });

    this.cue_button = new components.CueButton({
        midi: [0x90 + midi_chan, 0x01],
        off: 0x01,
        sendShifted: true,
        shiftControl: true,
        shiftOffset: 4,
        shift: function() {
            this.inKey = 'start';
        },
    });

    this.sync_button = new components.SyncButton({
        midi: [0x90 + midi_chan, 0x02],
        off: 0x01,
        sendShifted: true,
        shiftControl: true,
        shiftOffset: 1,
    });

    this.pfl_button = new components.Button({
        midi: [0x90 + midi_chan, 0x1B],
        key: 'pfl',
        off: 0x01,
        type: components.Button.prototype.types.toggle,
        connect: function() {
            components.Button.prototype.connect.call(this);
            this.connections[1] = engine.connectControl(this.group, this.outKey, MixtrackPlatinum.pflToggle);
        },
    });

    this.hotcue_buttons = new components.ComponentContainer();
    this.sampler_buttons = new components.ComponentContainer();
    for (var i = 1; i <= 4; ++i) {
        this.hotcue_buttons[i] = new components.HotcueButton({
            midi: [0x94 + midi_chan, 0x18 + i - 1],
            number: i,
            sendShifted: true,
            shiftControl: true,
            shiftOffset: 8,
        });

        // sampler buttons 5-8
        this.sampler_buttons[i] = new components.SamplerButton({
            midi: [0x94 + midi_chan, 0x18 + i - 1],
            sendShifted: true,
            shiftControl: true,
            shiftOffset: 8,
            number: i+4,
            loaded: 0x00,
            playing: 0x7F,
        });
    }
    this.hotcues = this.hotcue_buttons;

    this.pitch = new components.Pot({
        inKey: 'rate',
        invert: true,
    });
    if (!this.active) {
        this.pitch.firstValueReceived = true;
    }

    loop_base = function(midino, obj) {
        return _.assign({
            midi: [0x94 + midi_chan, midino],
            on: 0x01,
            sendShifted: true,
            shiftChannel: true,
            shiftOffset: -0x10,
        }, obj);
    };

    this.alternate_manloop = new components.ComponentContainer({
        loop_in: new components.HotcueButton(loop_base(0x38, {
            number: 5,
        })),
        loop_out: new components.HotcueButton(loop_base(0x39, {
            number: 6,
        })),
        loop_toggle: new components.HotcueButton(loop_base(0x32, {
            number: 7,
        })),
        loop_halve: new components.HotcueButton(loop_base(0x34, {
            number: 8,
        })),
        loop_double: new components.HotcueButton(loop_base(0x35, {
            number: 8,
        })),
    });
    this.normal_manloop = new components.ComponentContainer({
        loop_in: new components.Button(loop_base(0x38, {
            inKey: 'loop_in',
            outKey: 'loop_start_position',
            outValueScale: function (value) {
                return (value != -1) ? this.on : this.off;
            },
        })),
        loop_out: new components.Button(loop_base(0x39, {
            inKey: 'loop_out',
            outKey: 'loop_end_position',
            outValueScale: function (value) {
                return (value != -1) ? this.on : this.off;
            },
        })),
        loop_toggle: new components.LoopToggleButton(loop_base(0x32, {})),
        loop_halve: new components.Button(loop_base(0x34, {
            key: 'loop_halve',
            input: function(channel, control, value, status) {
                if (this.isPress(channel, control, value, status)) {
                    engine.setValue(deck.currentDeck, "loop_scale", 0.5);
                }
            },
        })),
        loop_double: new components.Button(loop_base(0x35, {
            key: 'loop_double',
            input: function(channel, control, value, status) {
                if (this.isPress(channel, control, value, status)) {
                    engine.setValue(deck.currentDeck, "loop_scale", 2.0);
                }
            },
        })),
    });
    // swap normal and alternate manual loop controls
    if (UseManualLoopAsCue) {
        var manloop = this.normal_manloop;
        this.normal_manloop = this.alternate_manloop;
        this.alternate_manloop = manloop;
    }
    this.manloop = this.normal_manloop;

    auto_loop_hotcue = function(midino, obj) {
        return _.assign({
            midi: [0x94 + midi_chan, midino],
            on: 0x40,
            sendShifted: true,
            shiftControl: true,
            shiftOffset: 0x08,
        }, obj);
    };

    auto_loop_base = function(midino, obj) {
        return _.assign({
            midi: [0x94 + midi_chan, midino],
            on: 0x40,
            sendShifted: true,
            shiftChannel: true,
            shiftOffset: -0x10,
        }, obj);
    };

    this.alternate_autoloop = new components.ComponentContainer({
        auto1: new components.HotcueButton(auto_loop_hotcue(0x14, {
            number: 5,
        })),
        auto2: new components.HotcueButton(auto_loop_hotcue(0x15, {
            number: 6,
        })),
        auto3: new components.HotcueButton(auto_loop_hotcue(0x16, {
            number: 7,
        })),
        auto4: new components.HotcueButton(auto_loop_hotcue(0x17, {
            number: 8,
        })),
    });
    this.alternate_autoloop.roll1 = this.alternate_autoloop.auto1;
    this.alternate_autoloop.roll2 = this.alternate_autoloop.auto2;
    this.alternate_autoloop.roll3 = this.alternate_autoloop.auto3;
    this.alternate_autoloop.roll4 = this.alternate_autoloop.auto4;

    this.normal_autoloop = new components.ComponentContainer({
        auto1: new components.Button(auto_loop_base(0x14, {
            inKey: 'beatloop_1_toggle',
            outKey: 'beatloop_1_enabled',
        })),
        auto2: new components.Button(auto_loop_base(0x15, {
            inKey: 'beatloop_2_toggle',
            outKey: 'beatloop_2_enabled',
        })),
        auto3: new components.Button(auto_loop_base(0x16, {
            inKey: 'beatloop_4_toggle',
            outKey: 'beatloop_4_enabled',
        })),
        auto4: new components.Button(auto_loop_base(0x17, {
            inKey: 'beatloop_8_toggle',
            outKey: 'beatloop_8_enabled',
        })),
        
        roll1: new components.Button(auto_loop_base(0x1C, {
            inKey: 'beatlooproll_0.0625_activate',
            outKey: 'beatloop_0.0625_enabled',
        })),
        roll2: new components.Button(auto_loop_base(0x1D, {
            inKey: 'beatlooproll_0.125_activate',
            outKey: 'beatloop_0.125_enabled',
        })),
        roll3: new components.Button(auto_loop_base(0x1E, {
            inKey: 'beatlooproll_0.25_activate',
            outKey: 'beatloop_0.25_enabled',
        })),
        roll4: new components.Button(auto_loop_base(0x1F, {
            inKey: 'beatlooproll_0.5_activate',
            outKey: 'beatloop_0.5_enabled',
        })),
    });

    // swap normal and alternate auto loop controls
    if (UseAutolLoopAsCue) {
        var autoloop = this.normal_autoloop;
        this.normal_autoloop = this.alternate_autoloop;
        this.alternate_autoloop = autoloop;
    }
    this.autoloop = this.normal_autoloop;

    this.pad_mode = new components.Component({
        input: function (channel, control, value, status, group) {
            // only handle button down events
            if (value != 0x7F) return;

            var shifted_hotcues = deck.sampler_buttons;
            var normal_hotcues = deck.hotcue_buttons;
            if (UseCueAsSampler) {
                shifted_hotcues = deck.hotcue_buttons;
                normal_hotcues = deck.sampler_buttons;
            }

            // if shifted, set a special mode
            if (this.isShifted) {
                // manual loop
                if (control == 0x0E) {
                    deck.manloop = deck.alternate_manloop;
                    deck.manloop.reconnectComponents();
                }
                // auto loop
                else if (control == 0x06) {
                    deck.autoloop = deck.alternate_autoloop;
                    deck.autoloop.reconnectComponents();
                }

                // hotcue sampler
                if (control == 0x0B) {
                    deck.hotcues.forEachComponent(function(component) {
                        component.disconnect();
                    });
                    deck.hotcues = shifted_hotcues;
                    deck.hotcues.reconnectComponents();
                }
                // reset hotcues in all other modes
                else {
                    deck.hotcues.forEachComponent(function(component) {
                        component.disconnect();
                    });
                    deck.hotcues = deck.hotcue_buttons;
                    deck.hotcues.reconnectComponents();
                }
            }
            // otherwise set a normal mode
            else {
                // manual loop
                if (control == 0x0E) {
                    deck.manloop = deck.normal_manloop;
                    deck.manloop.reconnectComponents();
                }
                // auto loop
                else if (control == 0x06) {
                    deck.autoloop = deck.normal_autoloop;
                    deck.autoloop.reconnectComponents();
                }

                // hotcue sampler
                if (control == 0x0B) {
                    deck.hotcues.forEachComponent(function(component) {
                        component.disconnect();
                    });
                    deck.hotcues = normal_hotcues;
                    deck.hotcues.reconnectComponents();
                }
                // reset hotcues
                else {
                    deck.hotcues.forEachComponent(function(component) {
                        component.disconnect();
                    });
                    deck.hotcues = deck.hotcue_buttons;
                    deck.hotcues.reconnectComponents();
                }
            }
        },
        shift: function() {
            this.isShifted = true;
        },
        unshift: function() {
            this.isShifted = false;
        },
    });

    this.EqEffectKnob = function (group, in_key, fx_key) {
        this.unshift_group = group;
        this.unshift_key = in_key;
        this.fx_key = fx_key;
        components.Pot.call(this, {
            group: group,
            inKey: in_key,
        });
    };
    this.EqEffectKnob.prototype = new components.Pot({
        shift: function() {
            var focused_effect = engine.getValue(eu.group, "focused_effect");
            if (focused_effect === 0) return;

            this.disconnect();
            this.group = '[EffectRack1_EffectUnit' + eu.currentUnitNumber + '_Effect' + focused_effect + ']';
            this.inKey = this.fx_key;
            this.connect();
        },
        unshift: function() {
            this.disconnect();
            this.group = this.unshift_group;
            this.inKey = this.unshift_key;
            this.connect();
        },
    });

    var eq_group = '[EqualizerRack1_' + this.currentDeck + '_Effect1]';
    this.high_eq = new this.EqEffectKnob(eq_group, 'parameter3', 'parameter3');
    this.mid_eq = new this.EqEffectKnob(eq_group, 'parameter2', 'parameter4');
    this.low_eq = new this.EqEffectKnob(eq_group, 'parameter1', 'parameter5');

    this.filter = new this.EqEffectKnob(
        '[QuickEffectRack1_' + this.currentDeck + ']',
        'super1',
        'parameter1');

    this.gain = new this.EqEffectKnob(
        this.currentDeck,
        'pregain',
        'parameter2');

    this.reconnectComponents(function (c) {
        if (c.group === undefined) {
            c.group = deck.currentDeck;
        }
    });

    // don't light up sampler buttons in hotcue mode
    this.sampler_buttons.forEachComponent(function(component) {
        component.disconnect();
    });

    this.setActive = function(active) {
        this.active = active;

        if (!active) {
            // trigger soft takeover on the pitch control
            this.pitch.disconnect();
        }
    };
};

MixtrackPlatinum.Deck.prototype = new components.Deck();

MixtrackPlatinum.Sampler = function(base) {
    for (var i = 1; i <= 4; ++i) {
        this[i] = new components.SamplerButton({
            midi: [0x9F, 0x20 + i],
            number: base+i-1,
            loaded: 0x00,
            playing: 0x7F,
        });
    }
};

MixtrackPlatinum.Sampler.prototype = new components.ComponentContainer();

MixtrackPlatinum.HeadGain = function(sampler) {
    components.Pot.call(this);

    this.shifted = false;
    this.sampler = sampler;
    this.sampler.forEachComponent(function(component) {
        engine.softTakeover(component.group, 'volume', true);
    });
};
MixtrackPlatinum.HeadGain.prototype = new components.Pot({
    group: '[Master]',
    inKey: 'headGain',
    input: function (channel, control, value, status, group) {
        if (this.shifted) {
            // make head gain control the sampler volume when shifted
            var pot = this;
            this.sampler.forEachComponent(function(component) {
                engine.setParameter(component.group, 'volume', pot.inValueScale(value));
            });
        } else {
            components.Pot.prototype.input.call(this, channel, control, value, status, group);
        }
    },
    shift: function() {
        this.shifted = true;
        this.disconnect();
        this.sampler.forEachComponent(function(component) {
            engine.softTakeoverIgnoreNextValue(component.group, 'volume');
        });
    },
    unshift: function() {
        this.shifted = false;
    },
});

MixtrackPlatinum.BrowseKnob = function() {
    this.knob = new components.Encoder({
        group: '[Library]',
        inKey: 'Move',
        input: function (channel, control, value, status, group) {
            if (value === 1) {
                engine.setParameter(this.group, this.inKey + 'Down', 1);
            } else if (value === 127) {
                engine.setParameter(this.group, this.inKey + 'Up', 1);
            }
        },
        unshift: function() {
            this.inKey = 'Move';
        },
        shift: function() {
            this.inKey = 'Scroll';
        },
    });

    this.button = new components.Button({
        group: '[Library]',
        inKey: 'GoToItem',
        unshift: function() {
            this.inKey = 'GoToItem';
        },
        shift: function() {
            this.inKey = 'MoveFocusForward';
        },
    });
};

MixtrackPlatinum.BrowseKnob.prototype = new components.ComponentContainer();

MixtrackPlatinum.encodeNum = function(number) {
    var number_array = [
        (number >> 28) & 0x0F,
        (number >> 24) & 0x0F,
        (number >> 20) & 0x0F,
        (number >> 16) & 0x0F,
        (number >> 12) & 0x0F,
        (number >> 8) & 0x0F,
        (number >> 4) & 0x0F,
        number & 0x0F,
    ];

    if (number < 0) number_array[0] = 0x07;
    else number_array[0] = 0x08;

    return number_array;
};

MixtrackPlatinum.duration = [
    -1,
    -1,
    -1,
    -1,
];
MixtrackPlatinum.screenDuration = function(deck, duration) {
    // don't do anything if duration didn't change
    if (MixtrackPlatinum.duration[deck - 1] == duration) return;
    MixtrackPlatinum.duration[deck - 1] = duration;

    if (duration < 1) duration = 1;
    duration = MixtrackPlatinum.encodeNum(duration - 1);

    var bytePrefix = [0xF0, 0x00, 0x20, 0x7F, deck, 0x03];
    var bytePostfix = [0xF7];
    var byteArray = bytePrefix.concat(duration, bytePostfix);
    midi.sendSysexMsg(byteArray, byteArray.length);
};

MixtrackPlatinum.screenTime = function(deck, time) {
    var time_val = MixtrackPlatinum.encodeNum(time);

    var bytePrefix = [0xF0, 0x00, 0x20, 0x7F, deck, 0x04];
    var bytePostfix = [0xF7];
    var byteArray = bytePrefix.concat(time_val, bytePostfix);
    midi.sendSysexMsg(byteArray, byteArray.length);
};

MixtrackPlatinum.screenBpm = function(deck, bpm) {
    bpm = MixtrackPlatinum.encodeNum(bpm);
    bpm.shift();
    bpm.shift();

    var bytePrefix = [0xF0, 0x00, 0x20, 0x7F, deck, 0x01];
    var bytePostfix = [0xF7];
    var byteArray = bytePrefix.concat(bpm, bytePostfix);
    midi.sendSysexMsg(byteArray, byteArray.length);
};

MixtrackPlatinum.bpmCallback = function(value, group, control) {
    var midi_chan = MixtrackPlatinum.channelMap[group];
    MixtrackPlatinum.screenBpm(midi_chan + 1, Math.round(value * 100));
};

MixtrackPlatinum.channelMap = {
    "[Channel1]": 0x00,
    "[Channel2]": 0x01,
    "[Channel3]": 0x02,
    "[Channel4]": 0x03,
};

MixtrackPlatinum.show_elapsed = [];
MixtrackPlatinum.elapsedToggle = function (channel, control, value, status, group) {
    if (value != 0x7F) return;
    MixtrackPlatinum.show_elapsed[channel] = !MixtrackPlatinum.show_elapsed[channel];
    var on_off = 0x7F;
    if (MixtrackPlatinum.show_elapsed[channel]) on_off = 0x00;
    midi.sendShortMsg(0x90 | channel, 0x46, on_off);
};

MixtrackPlatinum.timeMs = function(deck, position, duration) {
    return Math.round(duration * position * 1000);
};

MixtrackPlatinum.positionCallback = function(value, group, control) {
    var midi_chan = MixtrackPlatinum.channelMap[group];
    // the value appears to range from 0-52
    var pos = Math.round(value * 52);
    if (pos < 0) pos = 0;
    midi.sendShortMsg(0xB0 | midi_chan, 0x3F, pos);

    // update duration if necessary
    var duration = engine.getValue(group, 'duration');
    MixtrackPlatinum.screenDuration(midi_chan + 1, duration * 1000);

    // update the time display
    var time = MixtrackPlatinum.timeMs(midi_chan + 1, value, duration);
    MixtrackPlatinum.screenTime(midi_chan + 1, time);

    // update the spinner (range 64-115, 52 values)
    //
    // the visual spinner in the mixxx interface looks like it takes 1.8
    // seconds to loop, so we use that value here
    var spinner = Math.round((duration * value) % 1.8 * (52 / 1.8));
    if (spinner < 0) spinner += 115;
    else spinner += 64;

    midi.sendShortMsg(0xB0 | midi_chan, 0x06, spinner);
};

MixtrackPlatinum.deckSwitch = function (channel, control, value, status, group) {
    var deck = channel + 1;
    MixtrackPlatinum.decks[deck].setActive(value == 0x7F);

    // change effects racks
    if (MixtrackPlatinum.decks[deck].active && (channel == 0x00 || channel == 0x02)) {
        MixtrackPlatinum.effects[1].setCurrentUnit(deck);
    }
    else if (MixtrackPlatinum.decks[deck].active && (channel == 0x01 || channel == 0x03)) {
        MixtrackPlatinum.effects[2].setCurrentUnit(deck);
    }

    // also zero vu meters
    if (value != 0x7F) return;
    midi.sendShortMsg(0xBF, 0x44, 0);
    midi.sendShortMsg(0xBF, 0x45, 0);
};

// zero vu meters when toggling pfl
MixtrackPlatinum.pflToggle = function(value, group, control) {
    midi.sendShortMsg(0xBF, 0x44, 0);
    midi.sendShortMsg(0xBF, 0x45, 0);
};

MixtrackPlatinum.vuCallback = function(value, group, control) {
    // the top LED lights up at 81
    var level = value * 80;

    // if any channel pfl is active, show channel levels
    if (engine.getValue('[Channel1]', 'pfl')
        || engine.getValue('[Channel2]', 'pfl')
        || engine.getValue('[Channel3]', 'pfl')
        || engine.getValue('[Channel4]', 'pfl'))
    {
        if (engine.getValue(group, "PeakIndicator")) {
            level = 81;
        }

        if (group == '[Channel1]' && MixtrackPlatinum.decks[1].active) {
            midi.sendShortMsg(0xBF, 0x44, level);
        }
        else if (group == '[Channel3]' && MixtrackPlatinum.decks[3].active) {
            midi.sendShortMsg(0xBF, 0x44, level);
        }
        else if (group == '[Channel2]' && MixtrackPlatinum.decks[2].active) {
            midi.sendShortMsg(0xBF, 0x45, level);
        }
        else if (group == '[Channel4]' && MixtrackPlatinum.decks[4].active) {
            midi.sendShortMsg(0xBF, 0x45, level);
        }
    }
    else if (group == '[Master]' && control == 'VuMeterL') {
        if (engine.getValue(group, "PeakIndicatorL")) {
            level = 81;
        }
        midi.sendShortMsg(0xBF, 0x44, level);
    }
    else if (group == '[Master]' && control == 'VuMeterR') {
        if (engine.getValue(group, "PeakIndicatorR")) {
            level = 81;
        }
        midi.sendShortMsg(0xBF, 0x45, level);
    }
};

// these functions track if the user has let go of the deck but it is still
// spinning
MixtrackPlatinum.scratch_timer = [];
MixtrackPlatinum.scratch_tick = [];
MixtrackPlatinum.resetScratchTimer = function (deck, tick) {
    if (!MixtrackPlatinum.scratch_timer[deck]) return;
    MixtrackPlatinum.scratch_tick[deck] = tick;
};

MixtrackPlatinum.startScratchTimer = function (deck) {
    if (MixtrackPlatinum.scratch_timer[deck]) return;

    MixtrackPlatinum.scratch_tick[deck] = 0;
    MixtrackPlatinum.scratch_timer[deck] = engine.beginTimer(20, "MixtrackPlatinum.scratchTimer("+deck+")");
};

MixtrackPlatinum.stopScratchTimer = function (deck) {
    if (MixtrackPlatinum.scratch_timer[deck]) {
        engine.stopTimer(MixtrackPlatinum.scratch_timer[deck]);
    }
    MixtrackPlatinum.scratch_timer[deck] = null;
};

MixtrackPlatinum.scratchTimer = function (deck) {
    // here we see if the platter is still physically moving even though the
    // platter is not being touched. For forward motion, we stop scratching
    // before the platter has physically stopped when moving forward and delay
    // a little longer when moving back. This is to mimic actual vinyl better.
    if ((MixtrackPlatinum.scratch_direction[deck] // forward
            && Math.abs(MixtrackPlatinum.scratch_tick[deck]) > 2)
        || (!MixtrackPlatinum.scratch_direction[deck] // backward
            && Math.abs(MixtrackPlatinum.scratch_tick[deck]) > 0))
    {
        // reset tick detection
        MixtrackPlatinum.scratch_tick[deck] = 0;
        return;
    }

    MixtrackPlatinum.scratchDisable(deck);
};

MixtrackPlatinum.scratchDisable = function (deck) {
    MixtrackPlatinum.searching[deck] = false;
    MixtrackPlatinum.stopScratchTimer(deck);
    engine.scratchDisable(deck, false);
};

MixtrackPlatinum.scratchEnable = function (deck) {
    var alpha = 1.0/8;
    var beta = alpha/32;

    engine.scratchEnable(deck, 1011, 33+1/3, alpha, beta);
    MixtrackPlatinum.stopScratchTimer(deck);
};

// The button that enables/disables scratching
MixtrackPlatinum.touching = [];
MixtrackPlatinum.searching = [];
MixtrackPlatinum.wheelTouch = function (channel, control, value, status, group) {
    var deck = channel + 1;

    // ignore touch events if not in vinyl mode
    if (!MixtrackPlatinum.shift && !MixtrackPlatinum.searching[deck] && !MixtrackPlatinum.wheel[channel]) return;

    MixtrackPlatinum.touching[deck] = 0x7F == value;


    // don't start scratching if shift is pressed
    if (value === 0x7F
        && !MixtrackPlatinum.shift
        && !MixtrackPlatinum.searching[deck])
    {
        MixtrackPlatinum.scratchEnable(deck);
    }
    else if (value === 0x7F
             && (MixtrackPlatinum.shift
                || MixtrackPlatinum.searching[deck]))
    {
        MixtrackPlatinum.scratchDisable(deck);
        MixtrackPlatinum.searching[deck] = true;
        MixtrackPlatinum.stopScratchTimer(deck);
    }
    else {    // If button up
        MixtrackPlatinum.startScratchTimer(deck);
    }
};

// The wheel that actually controls the scratching
MixtrackPlatinum.scratch_direction = []; // true == forward
MixtrackPlatinum.scratch_accumulator = [];
MixtrackPlatinum.scratch_accumulator[1] = 0;
MixtrackPlatinum.scratch_accumulator[2] = 0;
MixtrackPlatinum.scratch_accumulator[3] = 0;
MixtrackPlatinum.scratch_accumulator[4] = 0;
MixtrackPlatinum.last_scratch_tick = [];
MixtrackPlatinum.wheelTurn = function (channel, control, value, status, group) {
    var deck = channel + 1;
    var direction;
    var newValue;
    if (value < 64) {
        direction = true;
    } else {
        direction = false;
    }

    // if the platter is spun fast enough, value will wrap past the 64 midpoint
    // but the platter will be spinning in the opposite direction we expect it
    // to be
    var delta = Math.abs(MixtrackPlatinum.last_scratch_tick[deck] - value);
    if (MixtrackPlatinum.scratch_direction[deck] !== null && MixtrackPlatinum.scratch_direction[deck] != direction && delta < 64) {
        direction = !direction;
    }

    if (direction) {
        newValue = value;
    } else {
        newValue = value - 128;
    }

    // detect searching the track
    if (MixtrackPlatinum.searching[deck]) {
        var position = engine.getValue(group, 'playposition');
        if (position <= 0) position = 0;
        if (position >= 1) position = 1;
        engine.setValue(group, 'playposition', position + newValue * 0.0001);
        MixtrackPlatinum.resetScratchTimer(deck, newValue);
        return;
    }

    // stop scratching if the wheel direction changes and the platter is not
    // being touched
    if (MixtrackPlatinum.scratch_direction[deck] === null) {
        MixtrackPlatinum.scratch_direction[deck] = direction;
    }
    else if (MixtrackPlatinum.scratch_direction[deck] != direction) {
        if (!MixtrackPlatinum.touching[deck]) {
            MixtrackPlatinum.scratchDisable(deck);
        }
        MixtrackPlatinum.scratch_accumulator[deck] = 0;
    }

    MixtrackPlatinum.last_scratch_tick[deck] = value;
    MixtrackPlatinum.scratch_direction[deck] = direction;
    MixtrackPlatinum.scratch_accumulator[deck] += Math.abs(newValue);

    // handle scratching
    if (engine.isScratching(deck)) {
        engine.scratchTick(deck, newValue); // Scratch!
        MixtrackPlatinum.resetScratchTimer(deck, newValue);
    }
    // handle beat jumping
    else if (MixtrackPlatinum.shift) {
        if (MixtrackPlatinum.scratch_accumulator[deck] > 61) {
            MixtrackPlatinum.scratch_accumulator[deck] -= 61;
            if (direction) { // forward
                engine.setParameter(group, 'beatjump_1_forward', 1);
            } else {
                engine.setParameter(group, 'beatjump_1_backward', 1);
            }
        }
    }
    // handle pitch bending
    else {
        engine.setValue(group, 'jog', newValue * 0.1); // Pitch bend
    }
};

MixtrackPlatinum.wheel = [];
MixtrackPlatinum.wheelToggle = function (channel, control, value, status, group) {
    if (value != 0x7F) return;
    MixtrackPlatinum.wheel[channel] = !MixtrackPlatinum.wheel[channel];
    var on_off = 0x01;
    if (MixtrackPlatinum.wheel[channel]) on_off = 0x7F;
    midi.sendShortMsg(0x90 | channel, 0x07, on_off);
};

MixtrackPlatinum.pitch = [
    [ 0, 0 ],
    [ 0, 0 ],
    [ 0, 0 ],
    [ 0, 0 ],
];

// track the state of the shift key
MixtrackPlatinum.shift = false;
MixtrackPlatinum.shiftToggle = function (channel, control, value, status, group) {
    MixtrackPlatinum.shift = value == 0x7F;

    if (MixtrackPlatinum.shift) {
        MixtrackPlatinum.decks.shift();
        MixtrackPlatinum.sampler_all.shift();
        MixtrackPlatinum.effects.shift();
        MixtrackPlatinum.browse.shift();
        MixtrackPlatinum.head_gain.shift();

        // reset the beat jump scratch accumulators
        MixtrackPlatinum.scratch_accumulator[1] = 0;
        MixtrackPlatinum.scratch_accumulator[2] = 0;
        MixtrackPlatinum.scratch_accumulator[3] = 0;
        MixtrackPlatinum.scratch_accumulator[4] = 0;
    }
    else {
        MixtrackPlatinum.decks.unshift();
        MixtrackPlatinum.sampler_all.unshift();
        MixtrackPlatinum.effects.unshift();
        MixtrackPlatinum.browse.unshift();
        MixtrackPlatinum.head_gain.unshift();
    }
};
