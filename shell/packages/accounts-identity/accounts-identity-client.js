// Sandstorm - Personal Cloud Sandbox
// Copyright (c) 2015 Sandstorm Development Group, Inc. and contributors
// All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var LoginIdentitiesOfLinkedAccounts = new Mongo.Collection("loginIdentitiesOfLinkedAccounts");
// Pseudocollection populated by the `accountsOfIdentity(sourceIdentityId)` subscription. Contains
// information about all login identities for all accounts that have the "source identity" linked.
//   _id: Identity ID of the login identity;
//   profile: Profile object for the login identity, as in the Users collection. Profile defaults
//            and the intrinsic name have already been filled in.
//   loginAccountId: ID of the account that the login identity can log in to.
//   sourceIdentityId: Identity ID of the source identity.

Template.identityLoginInterstitial.onCreated(function () {
  this._state = new ReactiveVar({justLoggingIn: true});
  var token = sessionStorage.getItem("linkingIdentityLoginToken");
  if (token) {
    this._state.set({linkingIdentity: true});
    sessionStorage.removeItem("linkingIdentityLoginToken");
    Meteor.call("linkIdentityToAccount", token, function (err, result) {
      if (err) {
        // TODO(soon): display this error somewhere that the user will see.
        console.log("Error", err);
      }
      Meteor.loginWithToken(token);
    });
  } else {
    var self = this;
    var sub = this.subscribe("accountsOfIdentity", Meteor.userId());
    Tracker.autorun(function() {
      if (sub.ready()) {
        var loginAccount =
            LoginIdentitiesOfLinkedAccounts.findOne({sourceIdentityId: Meteor.userId(),
                                                     _id: Meteor.userId()});
        if (loginAccount) {
          Meteor.loginWithIdentity(loginAccount.loginAccountId);
        } else if (!LoginIdentitiesOfLinkedAccounts.findOne({sourceIdentityId: Meteor.userId()})) {
          Meteor.call("createAccountForIdentity", function(err, result) {
            if (err) {
              console.log("error", err);
            } else {
              Meteor.loginWithIdentity(result);
            }
          });
        } else if ("justLoggingIn" in self._state.get()) {
          self._state.set({needInput: true});
        }
      }
    });
  }
});

Template.identityLoginInterstitial.helpers({
  needInput: function () {
    return "needInput" in Template.instance()._state.get();
  },
  linkingIdentity: function () {
    return "linkingIdentity" in Template.instance()._state.get();
  },
  currentIdentity: function () {
    var identities = SandstormDb.getUserIdentities(Meteor.user());
    return identities && identities.length > 0 && identities[0];
  },
  nonloginAccounts: function () {
    return LoginIdentitiesOfLinkedAccounts.find().fetch().map(function (identity) {
      SandstormDb.fillInPictureUrl(identity);
      return identity;
    });
  },
});

Template.identityLoginInterstitial.events({
  "click button.logout": function () {
    Meteor.logout();
  },
  "click button.unlink": function () {
    var userId = event.target.getAttribute("data-user-id")
    var user = Meteor.user();
    var identityId = user && user._id;

    Meteor.call("unlinkIdentity", userId, identityId, function (err, result) {
      if (err) {
        console.log("error: ", err);
      }
    });
  },
});

Template.loginIdentitiesOfLinkedAccounts.onCreated(function() {
  this.subscribe("accountsOfIdentity", this.data._id);
  this._showOtherAccounts = new ReactiveVar(false);
});

Template.loginIdentitiesOfLinkedAccounts.helpers({
  showOtherAccounts: function () {
    return Template.instance()._showOtherAccounts.get();
  },
  getOtherAccounts: function() {
    var id = Template.instance().data._id;
    return LoginIdentitiesOfLinkedAccounts.find({sourceIdentityId: id,
                                                 loginAccountId: {$ne: Meteor.userId()}})
        .fetch().map(function (identity) {
      SandstormDb.fillInPictureUrl(identity);
      return identity;
    });
  }
});

Template.loginIdentitiesOfLinkedAccounts.events({
  "click button.show-other-accounts": function(event, instance) {
    instance._showOtherAccounts.set(true);
  },
  "click button.hide-other-accounts": function(event, instance) {
    instance._showOtherAccounts.set(false);
  },
  "click button.unlink": function (event, instance) {
    var userId = event.target.getAttribute("data-user-id")
    var identityId = instance.data._id;

    Meteor.call("unlinkIdentity", userId, identityId, function (err, result) {
      if (err) {
        console.log("error: ", err);
      }
    });
  },
});

Template.identityPicker.events({
  "click button.pick-identity": function (event, instance) {
    instance.data.onPicked(event.currentTarget.getAttribute("data-identity-id"))
  },
});

Template.identityPicker.helpers({
  isCurrentIdentity: function () {
    return this._id === Template.instance().data.currentIdentityId;
  },
});

Template.identityCard.helpers({
  intrinsicName: function() {
    if (this.privateIntrinsicName) {
      return this.privateIntrinsicName;
    } else {
      return this.profile && this.profile.intrinsicName;
    }
  },
});

Meteor.loginWithIdentity = function (accountId, callback) {
  // Attempts to log into the account with ID `accountId`.

  check(accountId, String);

  Accounts.callLoginMethod({
    methodName: "loginWithIdentity",
    methodArguments: [accountId],
    userCallback: function (error, result) {
      if (error) {
        callback && callback(error);
      } else {
        callback && callback();
      }
    }
  });
};
