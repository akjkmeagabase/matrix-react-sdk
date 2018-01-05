/*
Copyright 2017 New Vector Ltd

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

import Modal from './Modal';
import sdk from './';
import MultiInviter from './utils/MultiInviter';
import { _t } from './languageHandler';
import MatrixClientPeg from './MatrixClientPeg';
import GroupStoreCache from './stores/GroupStoreCache';

export function showGroupInviteDialog(groupId) {
    const description = <div>
        <div>{ _t("Who would you like to add to this community?") }</div>
        <div className="warning">
            { _t(
                "Warning: any person you add to a community will be publicly "+
                "visible to anyone who knows the community ID",
            ) }
        </div>
    </div>;

    const groupStore = GroupStoreCache.getGroupStore(groupId);
    const AddressPickerDialog = sdk.getComponent("dialogs.AddressPickerDialog");
    Modal.createTrackedDialog('Group Invite', '', AddressPickerDialog, {
        title: _t("Invite new community members"),
        description: description,
        placeholder: _t("Name or matrix ID"),
        button: _t("Invite to Community"),
        validAddressTypes: ['mx-user-id'],
        excludedAddresses: groupStore.getGroupMembers().concat(groupStore.getGroupInvitedMembers()).map((member) => ({
            addressType: 'mx-user-id',
            address: member.userId,
        })), // no need to add ourselves as we must already be in the group
        onFinished: (success, addrs) => {
            if (!success) return;

            _onGroupInviteFinished(groupId, addrs);
        },
    });
}

export function showGroupAddRoomDialog(groupId) {
    return new Promise((resolve, reject) => {
        let addRoomsPublicly = false;
        const onCheckboxClicked = (e) => {
            addRoomsPublicly = e.target.checked;
        };
        const description = <div>
            <div>{ _t("Which rooms would you like to add to this community?") }</div>
        </div>;

        const checkboxContainer = <label className="mx_GroupAddressPicker_checkboxContainer">
            <input type="checkbox" onClick={onCheckboxClicked} />
            <div>
                { _t("Show these rooms to non-members on the community page and room list?") }
            </div>
        </label>;

        const groupStore = GroupStoreCache.getGroupStore(groupId);
        const AddressPickerDialog = sdk.getComponent("dialogs.AddressPickerDialog");
        Modal.createTrackedDialog('Add Rooms to Group', '', AddressPickerDialog, {
            title: _t("Add rooms to the community"),
            description: description,
            extraNode: checkboxContainer,
            placeholder: _t("Room name or alias"),
            button: _t("Add to community"),
            pickerType: 'room',
            validAddressTypes: ['mx-room-id'],
            excludedAddresses: groupStore.getGroupRooms().map((room) => ({
                addressType: 'mx-room-id',
                address: room.roomId,
            })),
            onFinished: (success, addrs) => {
                if (!success) return;

                _onGroupAddRoomFinished(groupId, addrs, addRoomsPublicly).then(resolve, reject);
            },
        });
    });
}

function _onGroupInviteFinished(groupId, addrs) {
    const multiInviter = new MultiInviter(groupId);

    const addrTexts = addrs.map((addr) => addr.address);

    multiInviter.invite(addrTexts).then((completionStates) => {
        // Show user any errors
        const errorList = [];
        for (const addr of Object.keys(completionStates)) {
            if (addrs[addr] === "error") {
                errorList.push(addr);
            }
        }

        if (errorList.length > 0) {
            const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
            Modal.createTrackedDialog('Failed to invite the following users to the group', '', ErrorDialog, {
                title: _t("Failed to invite the following users to %(groupId)s:", {groupId: groupId}),
                description: errorList.join(", "),
            });
        }
    }).catch((err) => {
        const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
        Modal.createTrackedDialog('Failed to invite users to group', '', ErrorDialog, {
            title: _t("Failed to invite users to community"),
            description: _t("Failed to invite users to %(groupId)s", {groupId: groupId}),
        });
    });
}

function _onGroupAddRoomFinished(groupId, addrs, addRoomsPublicly) {
    const matrixClient = MatrixClientPeg.get();
    const groupStore = GroupStoreCache.getGroupStore(groupId);
    const errorList = [];
    return Promise.all(addrs.map((addr) => {
        return groupStore
            .addRoomToGroup(addr.address, addRoomsPublicly)
            .catch(() => { errorList.push(addr.address); })
            .then(() => {
                const roomId = addr.address;
                const room = matrixClient.getRoom(roomId);
                // Can the user change related groups?
                if (!room || !room.currentState.mayClientSendStateEvent("m.room.related_groups", matrixClient)) {
                    return;
                }
                // Get the related groups
                const relatedGroupsEvent = room.currentState.getStateEvents('m.room.related_groups', '');
                const groups = relatedGroupsEvent ? relatedGroupsEvent.getContent().groups || [] : [];

                // Add this group as related
                if (!groups.includes(groupId)) {
                    groups.push(groupId);
                    return MatrixClientPeg.get().sendStateEvent(roomId, 'm.room.related_groups', {groups}, '');
                }
            }).reflect();
    })).then(() => {
        if (errorList.length === 0) {
            return;
        }
        const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
        Modal.createTrackedDialog(
            'Failed to add the following room to the group',
            '', ErrorDialog,
        {
            title: _t(
                "Failed to add the following rooms to %(groupId)s:",
                {groupId},
            ),
            description: errorList.join(", "),
        });
    });
}
