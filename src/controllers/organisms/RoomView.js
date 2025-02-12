/*
Copyright 2015 OpenMarket Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';

var MatrixClientPeg = require("../../MatrixClientPeg");
var React = require("react");
var q = require("q");
var ContentMessages = require("../../ContentMessages");
var WhoIsTyping = require("../../WhoIsTyping");
var Modal = require("../../Modal");
var ComponentBroker = require('../../ComponentBroker');

var ErrorDialog = ComponentBroker.get("organisms/ErrorDialog");

var dis = require("../../dispatcher");

var PAGINATE_SIZE = 20;
var INITIAL_SIZE = 100;

var ComponentBroker = require('../../ComponentBroker');
var Notifier = ComponentBroker.get('organisms/Notifier');

var tileTypes = {
    'm.room.message': ComponentBroker.get('molecules/MessageTile'),
    'm.room.member': ComponentBroker.get('molecules/MRoomMemberTile'),
    'm.call.invite': ComponentBroker.get('molecules/voip/MCallInviteTile'),
    'm.call.answer': ComponentBroker.get('molecules/voip/MCallAnswerTile'),
    'm.call.hangup': ComponentBroker.get('molecules/voip/MCallHangupTile'),
    'm.room.topic': ComponentBroker.get('molecules/EventAsTextTile'),
};

var DateSeparator = ComponentBroker.get('molecules/DateSeparator');

module.exports = {
    getInitialState: function() {
        return {
            room: this.props.roomId ? MatrixClientPeg.get().getRoom(this.props.roomId) : null,
            messageCap: INITIAL_SIZE,
            editingRoomSettings: false,
            uploadingRoomSettings: false,
        }
    },

    componentWillMount: function() {
        this.dispatcherRef = dis.register(this.onAction);
        MatrixClientPeg.get().on("Room.timeline", this.onRoomTimeline);
        MatrixClientPeg.get().on("Room.name", this.onRoomName);
        MatrixClientPeg.get().on("RoomMember.typing", this.onRoomMemberTyping);
        this.atBottom = true;
    },

    componentWillUnmount: function() {
        if (this.refs.messageWrapper) {
            var messageWrapper = this.refs.messageWrapper.getDOMNode();
            messageWrapper.removeEventListener('drop', this.onDrop);
            messageWrapper.removeEventListener('dragover', this.onDragOver);
        }
        dis.unregister(this.dispatcherRef);
        if (MatrixClientPeg.get()) {
            MatrixClientPeg.get().removeListener("Room.timeline", this.onRoomTimeline);
            MatrixClientPeg.get().removeListener("Room.name", this.onRoomName);
            MatrixClientPeg.get().removeListener("RoomMember.typing", this.onRoomMemberTyping);
        }
    },

    onAction: function(payload) {
        switch (payload.action) {
            case 'message_send_failed':
            case 'message_sent':
                this.setState({
                    room: MatrixClientPeg.get().getRoom(this.props.roomId)
                });
                this.forceUpdate();
                break;
            case 'notifier_enabled':
                this.forceUpdate();
                break;
        }
    },

    // MatrixRoom still showing the messages from the old room?
    // Set the key to the room_id. Sadly you can no longer get at
    // the key from inside the component, or we'd check this in code.
    /*componentWillReceiveProps: function(props) {
    },*/

    onRoomTimeline: function(ev, room, toStartOfTimeline) {
        if (!this.isMounted()) return;

        // ignore anything that comes in whilst pagingating: we get one
        // event for each new matrix event so this would cause a huge
        // number of UI updates. Just update the UI when the paginate
        // call returns.
        if (this.state.paginating) return;

        // no point handling anything while we're waiting for the join to finish:
        // we'll only be showing a spinner.
        if (this.state.joining) return;
        if (room.roomId != this.props.roomId) return;

        if (this.refs.messageWrapper) {
            var messageWrapper = this.refs.messageWrapper.getDOMNode();
            this.atBottom = messageWrapper.scrollHeight - messageWrapper.scrollTop <= messageWrapper.clientHeight;
        }
        this.setState({
            room: MatrixClientPeg.get().getRoom(this.props.roomId)
        });

        if (toStartOfTimeline && !this.state.paginating) {
            this.fillSpace();
        }
    },

    onRoomName: function(room) {
        if (room.roomId == this.props.roomId) {
            this.setState({
                room: room
            });
        }
    },

    onRoomMemberTyping: function(ev, member) {
        this.forceUpdate();
    },

    componentDidMount: function() {
        if (this.refs.messageWrapper) {
            var messageWrapper = this.refs.messageWrapper.getDOMNode();

            messageWrapper.addEventListener('drop', this.onDrop);
            messageWrapper.addEventListener('dragover', this.onDragOver);

            messageWrapper.scrollTop = messageWrapper.scrollHeight;

            this.fillSpace();
        }
    },

    componentDidUpdate: function() {
        if (!this.refs.messageWrapper) return;

        var messageWrapper = this.refs.messageWrapper.getDOMNode();

        if (this.state.paginating && !this.waiting_for_paginate) {
            var heightGained = messageWrapper.scrollHeight - this.oldScrollHeight;
            messageWrapper.scrollTop += heightGained;
            this.oldScrollHeight = undefined;
            if (!this.fillSpace()) {
                this.setState({paginating: false});
            }
        } else if (this.atBottom) {
            messageWrapper.scrollTop = messageWrapper.scrollHeight;
        }
    },

    fillSpace: function() {
        var messageWrapper = this.refs.messageWrapper.getDOMNode();
        if (messageWrapper.scrollTop < messageWrapper.clientHeight && this.state.room.oldState.paginationToken) {
            this.setState({paginating: true});

            this.oldScrollHeight = messageWrapper.scrollHeight;

            if (this.state.messageCap < this.state.room.timeline.length) {
                this.waiting_for_paginate = false;
                var cap = Math.min(this.state.messageCap + PAGINATE_SIZE, this.state.room.timeline.length);
                this.setState({messageCap: cap, paginating: true});
            } else {
                this.waiting_for_paginate = true;
                var cap = this.state.messageCap + PAGINATE_SIZE;
                this.setState({messageCap: cap, paginating: true});
                var self = this;
                MatrixClientPeg.get().scrollback(this.state.room, PAGINATE_SIZE).finally(function() {
                    self.waiting_for_paginate = false;
                    if (self.isMounted()) {
                        self.setState({
                            room: MatrixClientPeg.get().getRoom(self.props.roomId)
                        });
                    }
                    // wait and set paginating to false when the component updates
                });
            }

            return true;
        }
        return false;
    },

    onJoinButtonClicked: function(ev) {
        var self = this;
        MatrixClientPeg.get().joinRoom(this.props.roomId).then(function() {
            self.setState({
                joining: false,
                room: MatrixClientPeg.get().getRoom(self.props.roomId)
            });
        }, function(error) {
            self.setState({
                joining: false,
                joinError: error
            });
        });
        this.setState({
            joining: true
        });
    },

    onMessageListScroll: function(ev) {
        if (this.refs.messageWrapper) {
            var messageWrapper = this.refs.messageWrapper.getDOMNode();
            this.atBottom = messageWrapper.scrollHeight - messageWrapper.scrollTop <= messageWrapper.clientHeight;
        }
        if (!this.state.paginating) this.fillSpace();
    },

    onDragOver: function(ev) {
        ev.stopPropagation();
        ev.preventDefault();

        ev.dataTransfer.dropEffect = 'none';

        var items = ev.dataTransfer.items;
        if (items.length == 1) {
            if (items[0].kind == 'file') {
                ev.dataTransfer.dropEffect = 'copy';
            }
        }
    },

    onDrop: function(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        var files = ev.dataTransfer.files;
        if (files.length == 1) {
            this.uploadFile(files[0]);
        }
    },

    uploadFile: function(file) {
        this.setState({
            upload: {
                fileName: file.name,
                uploadedBytes: 0,
                totalBytes: file.size
            }
        });
        var self = this;
        ContentMessages.sendContentToRoom(
            file, this.props.roomId, MatrixClientPeg.get()
        ).progress(function(ev) {
            //console.log("Upload: "+ev.loaded+" / "+ev.total);
            self.setState({
                upload: {
                    fileName: file.name,
                    uploadedBytes: ev.loaded,
                    totalBytes: ev.total
                }
            });
        }).finally(function() {
            self.setState({
                upload: undefined
            });
        }).done(undefined, function() {
            // display error message
        });
    },

    getWhoIsTypingString: function() {
        return WhoIsTyping.whoIsTypingString(this.state.room);
    },

    getEventTiles: function() {
        var ret = [];
        var count = 0;

        for (var i = this.state.room.timeline.length-1; i >= 0 && count < this.state.messageCap; --i) {
            var mxEv = this.state.room.timeline[i];
            var TileType = tileTypes[mxEv.getType()];
            var continuation = false;
            var last = false;
            var dateSeparator = null;
            if (i == this.state.room.timeline.length - 1) {
                last = true;
            }
            if (i > 0 && count < this.state.messageCap - 1) {
                if (this.state.room.timeline[i].sender &&
                    this.state.room.timeline[i - 1].sender &&
                    (this.state.room.timeline[i].sender.userId ===
                        this.state.room.timeline[i - 1].sender.userId) &&
                    (this.state.room.timeline[i].getType() ==
                        this.state.room.timeline[i - 1].getType())
                    )
                {
                    continuation = true;
                }

                var ts0 = this.state.room.timeline[i - 1].getTs();
                var ts1 = this.state.room.timeline[i].getTs();
                if (new Date(ts0).toDateString() !== new Date(ts1).toDateString()) {
                    dateSeparator = <DateSeparator key={ts1} ts={ts1}/>;
                    continuation = false;
                }
            }
            if (!TileType) continue;
            ret.unshift(
                <TileType key={mxEv.getId()} mxEvent={mxEv} continuation={continuation} last={last}/>
            );
            if (dateSeparator) {
                ret.unshift(dateSeparator);
            }
            ++count;
        }
        return ret;
    },

    uploadNewState: function(new_name, new_topic, new_join_rule, new_history_visibility, new_power_levels) {
        var old_name = this.state.room.name;

        var old_topic = this.state.room.currentState.getStateEvents('m.room.topic', '');
        if (old_topic) {
            old_topic = old_topic.getContent().topic;
        } else {
            old_topic = "";
        }

        var old_join_rule = this.state.room.currentState.getStateEvents('m.room.join_rules', '');
        if (old_join_rule) {
            old_join_rule = old_join_rule.getContent().join_rule;
        } else {
            old_join_rule = "invite";
        }

        var old_history_visibility = this.state.room.currentState.getStateEvents('m.room.history_visibility', '');
        if (old_history_visibility) {
            old_history_visibility = old_history_visibility.getContent().history_visibility;
        } else {
            old_history_visibility = "shared";
        }

        var deferreds = [];

        if (old_name != new_name && new_name != undefined && new_name) {
            deferreds.push(
                MatrixClientPeg.get().setRoomName(this.state.room.roomId, new_name)
            );
        }

        if (old_topic != new_topic && new_topic != undefined) {
            deferreds.push(
                MatrixClientPeg.get().setRoomTopic(this.state.room.roomId, new_topic)
            );
        }

        if (old_join_rule != new_join_rule && new_join_rule != undefined) {
            deferreds.push(
                MatrixClientPeg.get().sendStateEvent(
                    this.state.room.roomId, "m.room.join_rules", {
                        join_rule: new_join_rule,
                    }, ""
                )
            );
        }

        if (old_history_visibility != new_history_visibility && new_history_visibility != undefined) {
            deferreds.push(
                MatrixClientPeg.get().sendStateEvent(
                    this.state.room.roomId, "m.room.history_visibility", {
                        history_visibility: new_history_visibility,
                    }, ""
                )
            );
        }

        if (new_power_levels) {
            deferreds.push(
                MatrixClientPeg.get().sendStateEvent(
                    this.state.room.roomId, "m.room.power_levels", new_power_levels, ""
                )
            );
        }

        if (deferreds.length) {
            var self = this;
            q.all(deferreds).fail(function(err) {
                Modal.createDialog(ErrorDialog, {
                    title: "Failed to set state",
                    description: err.toString()
                });
            }).finally(function() {
                self.setState({
                    uploadingRoomSettings: false,
                });
            });
        } else {
            this.setState({
                editingRoomSettings: false,
                uploadingRoomSettings: false,
            });
        }
    }
};
