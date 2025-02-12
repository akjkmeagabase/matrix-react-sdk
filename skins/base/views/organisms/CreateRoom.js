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

var React = require('react');

var CreateRoomController = require("../../../../src/controllers/organisms/CreateRoom");

var ComponentBroker = require('../../../../src/ComponentBroker');

var PresetValues = require('../../../../src/controllers/atoms/create_room/Presets').Presets;

var CreateRoomButton = ComponentBroker.get("atoms/create_room/CreateRoomButton");
var RoomAlias = ComponentBroker.get("atoms/create_room/RoomAlias");
var Presets = ComponentBroker.get("atoms/create_room/Presets");
var UserSelector = ComponentBroker.get("molecules/UserSelector");

var Loader = require("react-loader");


module.exports = React.createClass({
    displayName: 'CreateRoom',
    mixins: [CreateRoomController],

    getPreset: function() {
        return this.refs.presets.getPreset();
    },

    getName: function() {
        return this.refs.name_textbox.getName();
    },

    getTopic: function() {
        return this.refs.topic.getTopic();
    },

    getAliasLocalpart: function() {
        return this.refs.alias.getAliasLocalpart();
    },

    getInvitedUsers: function() {
        return this.refs.user_selector.getUserIds();
    },

    onPresetChanged: function(preset) {
        switch (preset) {
            case PresetValues.PrivateChat:
                this.setState({
                    preset: preset,
                    is_private: true,
                    share_history: false,
                });
                break;
            case PresetValues.PublicChat:
                this.setState({
                    preset: preset,
                    is_private: false,
                    share_history: true,
                });
                break;
            case PresetValues.Custom:
                this.setState({
                    preset: preset,
                });
                break;
        }
    },

    onPrivateChanged: function(ev) {
        this.setState({
            preset: PresetValues.Custom,
            is_private: ev.target.checked,
        });
    },

    onShareHistoryChanged: function(ev) {
        this.setState({
            preset: PresetValues.Custom,
            share_history: ev.target.checked,
        });
    },

    onTopicChange: function(ev) {
        this.setState({
            topic: ev.target.value,
        });
    },

    onNameChange: function(ev) {
        this.setState({
            room_name: ev.target.value,
        });
    },

    onInviteChanged: function(invited_users) {
        this.setState({
            invited_users: invited_users,
        });
    },

    onAliasChanged: function(alias) {
        this.setState({
            alias: alias
        })
    },

    onEncryptChanged: function(ev) {
        this.setState({
            encrypt: ev.target.checked,
        });
    },

    render: function() {
        var curr_phase = this.state.phase;
        if (curr_phase == this.phases.CREATING) {
            return (
                <Loader/>
            );
        } else {
            var error_box = "";
            if (curr_phase == this.phases.ERROR) {
                error_box = (
                    <div className="mx_Error">
                        An error occured: {this.state.error_string}
                    </div>
                );
            }
            return (
                <div className="mx_CreateRoom">
                    <input type="text" ref="room_name" value={this.state.room_name} onChange={this.onNameChange} placeholder="Name"/> <br />
                    <textarea ref="topic" value={this.state.topic} onChange={this.onTopicChange} placeholder="Description"/> <br />
                    <RoomAlias ref="alias" alias={this.state.alias} onChange={this.onAliasChanged}/> <br />
                    <UserSelector ref="user_selector" selected_users={this.state.invited_users} onChange={this.onInviteChanged}/> <br />
                    <Presets ref="presets" onChange={this.onPresetChanged} preset={this.state.preset}/> <br />
                    <label><input type="checkbox" ref="is_private" checked={this.state.is_private} onChange={this.onPrivateChanged}/> Make this room private</label>
                    <label><input type="checkbox" ref="share_history" checked={this.state.share_history} onChange={this.onShareHistoryChanged}/> Share message history with new users</label>
                    <label><input type="checkbox" ref="encrypt" checked={this.state.encrypt} onChange={this.onEncryptChanged}/> Encrypt room</label>
                    <CreateRoomButton onCreateRoom={this.onCreateRoom} /> <br />
                    {error_box}
                </div>
            );
        }
    }
});
