/*******************************************************************************
 *  Code contributed to the webinos project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright 2012 - 2013 Samsung Electronics (UK) Ltd
 * Author: Habib Virji (habib.virji@gmail.com)
 *******************************************************************************/
 
// The arguments are: a set of PZHs, the hostname of the PZH, the PZH Web Server
// port, the PZH TLS server port, then functions for adding, refreshing and
// retrieving PZH details.
var pzhWI = function (conn, pzhs, hostname, port, serverPort, addPzh, refreshPzh, getAllPzh) {
    "use strict";
    var wUtil = require("webinos-utilities")
    var logger = wUtil.webinosLogging (__filename) || console;
    var lock = true;
    var messageType = {
        "getUserDetails"        :getUserDetails,
        "getZoneStatus"         :getZoneStatus,
        "getCrashLog"           :getCrashLog,
        "getInfoLog"            :getInfoLog,
        "getPzps"               :getPZPs,
        "revokePzp"             :revokePzp,
        "listAllServices"       :listAllServices,
        "listUnregServices"     :listUnRegisterServices,
        "registerService"       :registerService,
        "unregisterService"     :unregisterService,
        "getCertificates"       :getCertificates,
        "storeExternalCert"     :storeExternalCert,
        "requestAddFriend"      :requestAddFriend,
        "requestAddLocalFriend" :requestAddLocalFriend,
        "getExpectedExternal"   :getExpectedExternal,
        "approveFriend"         :approveFriend,
        "rejectFriend"          :rejectFriend,
        "authCode"              :authCode,
        "csrAuthCodeByPzp"      :csrAuthCodeByPzp,
        "getAllPzh"             :getAllPzhList,
        "approveUser"           :approveUser,
        "removePzh"             :removePzh
    };

    /**
     * A locking code while creating a PZH.. Any request is blocked based on lock variable value
     * @return {Boolean}
     */
    function getLock () {
        return lock;
    }

    function setLock () {
        lock = false;
    }

    function releaseLock () {
        lock = true;
    }

    /**
     * Sends message to the PZH WebServer.
     * @param {object}user - User login details
     * @param {object}msg  - message to respond back to the PZH WebServer
     */
    function sendMsg (user, msg) {
        var jsonString = JSON.stringify ({user:user, payload:msg});
        logger.log("Response " + jsonString);
        var buf = wUtil.webinosMsgProcessing.jsonStr2Buffer (jsonString);
        conn.write (buf);
    }

    // HELPER FUNCTIONS
    /**
     * Based on PZH instance fetches the connected pzp details
     * @param _instance of the PZH
     * @return {Array} with connected PZP details
     */
    function getConnectedPzp (_instance) {
        var i, pzps = [], isConnected, id;
        if(_instance.config.trustedList.pzp) {
            var list = Object.keys(_instance.config.trustedList.pzp);
            for (i = 0; i < list.length; i = i + 1) {
                isConnected = !!(_instance.pzh_state.connectedPzp.hasOwnProperty (list[i]));
                id = (_instance.pzh_state.connectedPzp[list[i]] && _instance.pzh_state.connectedPzp[list[i]].friendlyName) || list[i];
                pzps.push ({id: id, url:list[i], isConnected:isConnected});
            }
        }
        for (i in _instance.pzh_state.connectedDevicesToOtherPzh.pzp) {
            if (_instance.pzh_state.connectedDevicesToOtherPzh.pzp.hasOwnProperty(i)) {
                pzps.push ({id: _instance.pzh_state.connectedDevicesToOtherPzh.pzp[i] || i,
                url:i, isConnected:true});
            }
        }
        return pzps;
    }

    /**
     * Based on PZH instance fetches the connected pzh details
     * @param _instance of the PZH
     * @return {Array} with connected PZH details
     */
    function getConnectedPzh (_instance) {
        var pzhs = [], i, isConnected, id;
        if(_instance.config.trustedList.pzh) {
            var list = Object.keys (_instance.config.trustedList.pzh);
            for (i = 0; i < list.length; i = i + 1) {
                isConnected = !!(_instance.pzh_state.connectedPzh.hasOwnProperty (list[i]));
                id =  (_instance.pzh_state.connectedPzh[list[i]] && _instance.pzh_state.connectedPzh[list[i]].friendlyName) || list[i];
                pzhs.push ({id: id, url:list[i], isConnected:isConnected});
            }
            for (i in _instance.pzh_state.connectedDevicesToOtherPzh.pzh) {
                if (_instance.pzh_state.connectedDevicesToOtherPzh.pzh.hasOwnProperty(i)) {
                    pzhs.push ({id: _instance.pzh_state.connectedDevicesToOtherPzh.pzh[i]|| i,
                        url:i, isConnected:true});
                }
            }
        }
        pzhs.push ({id:_instance.config.metaData.friendlyName+" (Your Pzh)", url:_instance.config.metaData.serverName, isConnected:true});
        return pzhs;
    }

    /**
     * List of revoked certificates at the PZH
     * @param _instance - PZH instance
     * @return {Array} - list of all revoked certificates
     */
    function getRevokedCert (_instance) {
        var revokedCert = [], myKey;
        for (myKey in _instance.config.cert.internal.revokedCert) {
            if (_instance.config.cert.internal.revokedCert.hasOwnProperty (myKey)) {
                revokedCert.push ({id:myKey, url:myKey, isConnected:false});
            }
        }
        return revokedCert;
    }
    //END OF HELPER FUNCTIONS\\
    /**
     * Used to show a drop down on PZH WI to show all present PZH in the FARM
     * @param obj
     * @param userObj
     */
    function getAllPzhList (obj, userObj) {
        sendMsg (obj.user, { type:"getAllPzh", message:getAllPzh (userObj.pzh_state.sessionId, userObj) });
    }

    /**
     * Fetch user details
     * @param obj
     * @param userObj
     */
    function getUserDetails (obj, userObj) {
        sendMsg (obj.user, { type:"getUserDetails", message:userObj.config.userData });
    }

    /**
     * @requires webinos-api-notificationa - for sending notifications internally
     * @param pzh
     * @param notification
     * @param idcallback
     * @param resultcallback
     */
    function notifyUser(pzh, notification, idcallback, resultcallback) {
        if (require.resolve("webinos-api-notifications")) {
            logger.log("NotifyUser method with pzh id: " + pzh);
            var path = require("path");
            var Notifications = require(path.join(require.resolve("webinos-api-notifications"), "../", "notificationPzh.js"));
            Notifications.sendFromInternal(pzh, notification, idcallback, resultcallback);
        }
    }

    /**
     *
     * @param obj
     * @param userObj
     */
    function getZoneStatus (obj, userObj) {
        var result = {pzps:[], pzhs:[]};
        result.pzps = getConnectedPzp (userObj);
        result.pzhs = getConnectedPzh (userObj);
        sendMsg (obj.user, { type:"getZoneStatus", message:result });
    }

    /**
     *
     * @param obj
     * @param userObj
     */
    function getCrashLog (obj, userObj) {
        logger.fetchLog ("error", "Pzh", userObj.config.metaData.friendlyName, function (data) {
            sendMsg (obj.user, { type:"getCrashLog", message:data });
        });
    }

    /**
     *
     * @param obj
     * @param userObj
     */
    function getInfoLog (obj, userObj) {
        logger.fetchLog ("info", "Pzh", userObj.config.metaData.friendlyName, function (data) {
            sendMsg(obj.user, { type:"getInfoLog", message:data });
        });
    }

    /**
     *
     * @param obj
     * @param userObj
     */
    function getPZPs (obj, userObj) {
        var result = {signedCert:[], revokedCert:[]}, myKey;
        result.signedCert = getConnectedPzp (userObj);
        result.revokedCert = getRevokedCert (userObj);
        sendMsg(obj.user, { type:"getPzps", message:result });
    }

    /**
     *
     * @param obj
     * @param userObj
     */
    function revokePzp (obj, userObj) {
        userObj.revoke.revokeCert (obj.message.pzpid, refreshPzh, function (result) {
            sendMsg( obj.user, { type:"revokePzp", message:result });
        });
    }

    /**
     *
     * @param userObj
     * @return {Object}
     */
    function getServices (userObj) {
        var result = { pzEntityList:[] }, connectedPzp = getConnectedPzp (userObj), key;
        result.pzEntityList.push ({pzId:userObj.pzh_state.sessionId});
        for (key = 0; key < connectedPzp.length; key = key + 1) {
            result.pzEntityList.push ({pzId:connectedPzp[key].url});
        }
        result.services = userObj.pzh_otherManager.discovery.getAllServices ();
        return result;
    }

    /**
     *
     * @param obj
     * @param userObj
     */
    function listAllServices (obj, userObj) {
        sendMsg( obj.user, { type:"listAllServices", message:getServices (userObj) });
    }

    /**
     *
     * @param userObj
     * @param msg
     * @param remove
     */
    function updateServiceCache (userObj, msg, remove) {
        var name, url;
        if (remove) {
            url = require ("url").parse (msg.svAPI);
            if (url.slashes) {
                if (url.host === "webinos.org") {
                    name = url.pathname.split ("/")[2];
                } else if (url.host === "www.w3.org") {
                    name = url.pathname.split ("/")[3];
                } else {
                    name = msg.svAPI;
                }
            }
        } else {
            name = msg.name;
        }
        for (var i = 0; i < userObj.config.serviceCache.length; i = i + 1) {
            if (userObj.config.serviceCache[i].name === name) {
                userObj.config.serviceCache.splice (i, 1);
                userObj.config.storeDetails("userData", "serviceCache", userObj.config.serviceCache);
                return;
            }
        }
        if (!remove) {
            userObj.config.serviceCache.splice (i, 0, {"name":name, "params":{} });
            userObj.config.storeDetails("userData", "serviceCache", userObj.config.serviceCache);
        }
    }

    /**
     *
     * @param obj
     * @param userObj
     */
    function listUnRegisterServices (obj, userObj) {
        if (userObj.pzh_state.sessionId !== obj.message.at) { // Different PZH
            var id = userObj.pzh_otherManager.addMsgListener (function (modules) {
                sendMsg( obj.user, { type:"listUnregServices",
                    message                    :{"pzEntityId":obj.message.at, "modules":modules.services} });
            });
            var msg = userObj.prepMsg (obj.message.at, "listUnregServices", {listenerId:id});
            userObj.sendMessage (msg, obj.message.at);
        } else { // returns all the current serviceCache
            var data = require ("fs").readFileSync ("./webinos_config.json");
            var c = JSON.parse (data.toString ());
            sendMsg( obj.user, { type:"listUnregServices",
                message:{"pzEntityId":userObj.pzh_state.sessionId, "modules":c.pzhDefaultServices} }); // send default services...
        }
    }

    /**
     *
     * @param obj
     * @param userObj
     */
    function registerService (obj, userObj) {
        if (userObj.pzh_state.sessionId !== obj.message.at) {
            var msg = userObj.prepMsg (obj.message.at, "registerService",
                {name:obj.message.name, params:{}});
            userObj.sendMessage (msg, obj.message.at);
        } else {
            util.webinosService.loadServiceModule (
                {"name":obj.message.name, "params":{}},
                userObj.pzh_otherManager.registry,
                userObj.pzh_otherManager.rpcHandler);
            updateServiceCache (userObj, obj.message, false);
        }

        sendMsg( obj.user, { type:"registerService", message:getServices (userObj) });
    }

    /**
     *
     * @param obj
     * @param userObj
     */
    function unregisterService (obj, userObj) {
        if (userObj.pzh_state.sessionId !== obj.message.at) {
            var msg = userObj.prepMsg (obj.message.at, "unregisterService",
                {svId:obj.message.svId, svAPI:obj.message.svAPI})
            userObj.sendMessage (msg, obj.message.at);
        } else {
            userObj.pzh_otherManager.registry.unregisterObject ({id:obj.message.svId, api:obj.message.svAPI});
            updateServiceCache (userObj, obj.message, true);
        }
        sendMsg( obj.user, { type:"unregisterService", message:getServices (userObj) });
    }

    // First step in connect friend
    // The PZH we are trying to connect calls this to sends its certificate to connecting PZH
    function getCertificates (obj, userObj) {
        var result = {
            "provider"  :"provider-cert-data",
            "server"    :userObj.config.cert.internal.master.cert,
            "crl"       :userObj.config.crl.value,
            "serverPort":userObj.config.userPref.ports.provider
        };
        sendMsg( obj.user, { type:"getCertificates", message:result });
    }

    // Second step
    // Connecting PZH stores certificates retrieved from another PZH
    function storeExternalCert (obj, userObj) {
        logger.log (obj.user.displayName + " is now expecting external connection from " + obj.message.externalEmail);
        var url = require ("url").parse ("https://" + obj.message.externalPzh);
        var name = url.hostname + "_" + obj.message.externalEmail;
        if (url.port && parseInt (url.port) !== 443) {
            name = url.hostname + ":" + url.port + "_" + obj.message.externalEmail;
        }

        if (userObj.config.cert.external.hasOwnProperty (name) && userObj.config.trustedList.pzh.hasOwnProperty (name)) {
            sendMsg( obj.user, { type:"storeExternalCert", message:false }); // PZH ALREADY ENROLLED
        } else {
            if (!userObj.config.cert.external.hasOwnProperty (name)) {
                userObj.config.cert.external[name] = {
                    url          :"https://" + obj.message.externalPzh + "/main/" + obj.message.externalEmail + "/",
                    host         :url.hostname,
                    port         :url.port ? url.port : 443,
                    externalCerts:obj.message.externalCerts.server,
                    externalCrl  :obj.message.externalCerts.crl,
                    serverPort   :obj.message.externalCerts.serverPort
                };
                userObj.config.storeDetails(require("path").join("certificates", "external"),"certificates", userObj.config.cert.external);
                var id = hostname + "_" + userObj.config.userData.email[0].value;
                if (port !== 443) {
                    id = hostname + ":" + port + "_" + userObj.config.userData.email[0].value;
                }
                refreshPzh (id,  userObj.setConnParam());

            }
            if (!userObj.config.trustedList.pzh.hasOwnProperty (name)) {
                userObj.config.trustedList.pzh[name] = {};
                userObj.config.storeDetails(null, "trustedList", userObj.config.trustedList);
            }
            sendMsg( obj.user, { type:"storeExternalCert", message:true });
        }
        // After this step OpenId authentication is triggered
    }

    // Third step
    // The PZH we are trying to connect calls this presumably this should return something unique
    function requestAddFriend (obj, userObj) {
        logger.log ("PZH TLS Server is now aware that the user " +
            obj.message.externalUser.email + " with PZH details : " + obj.message.externalPzh.externalPZHUrl +
            " has been authenticated and would like to be added to the list of trusted users to " +
            obj.user + "'s zone");
        
        // notify the user about it.  This may or may not be successful, it doesn't
        // really matter.  
        var approveURL = "https://" + hostname + "/main/" + 
                encodeURIComponent(userObj.config.metaData.webinosName) + 
                "/approve-user/" + encodeURIComponent(obj.message.externalUser.email) + "/"        
        notifyUser(
            userObj.config.metaData.serverName, 
            { "type" : "connection request", 
              "url"  : approveURL,
              "user" : { "email" : obj.message.externalUser.email,
                         "fullname" : obj.message.externalUser.fullname,
                         "nickname" : obj.message.externalUser.nickname,
                         "image" : obj.message.externalUser.image
                       }
            },
            function(id) { /* don't care */ }, 
            function(id) { /* don't care */ }
        );

        var url = require ("url").parse (obj.message.externalPzh.externalPZHUrl);
        userObj.config.untrustedCert[obj.message.externalUser.email] = {
            host         :url.hostname,
            port         :url.port ? url.port : 443,
            url          :obj.message.externalPzh.externalPZHUrl,
            externalCerts:obj.message.externalPzh.pzhCerts.server,
            externalCrl  :obj.message.externalPzh.pzhCerts.crl,
            serverPort   :obj.message.externalPzh.pzhCerts.serverPort};
        userObj.config.storeDetails(null, "untrustedList", userObj.config.untrustedCert);
        sendMsg( obj.user, { type:"requestAddFriend", message:true });
    }

    // Fourth Step
    // Connecting Pzh calls this to
    function approveUser (obj, userObj) {
        function userList () {
            var list = [];
            for (var item in userObj.config.untrustedCert) {
                if (userObj.config.untrustedCert.hasOwnProperty (item)) {
                    list.push ({name:item, url:userObj.config.untrustedCert[item].url});
                }
            }
            return list;
        }

        sendMsg( obj.user, { type:"approveUser", message:userList () });
    }

    // Fifth
    // The PZH Connecting calls this to get approval from other PZH
    function getExpectedExternal (obj, userObj) {
        logger.log ("Is " + obj.user.emails[0].value + " expecting to be asked to approve access to " +
            obj.message.externalEmail + "? ... Yes");
        if (userObj.config.untrustedCert.hasOwnProperty (obj.message.externalEmail)) {
            sendMsg( obj.user, { type:"getExpectedExternal", message:true });
        } else {
            sendMsg( obj.user, { type:"getExpectedExternal", message:false });
        }
    }

    // Sixth
    function approveFriend (obj, userObj) {
        if (userObj.config.untrustedCert.hasOwnProperty (obj.message.externalEmail)) {
            logger.log ("Approving friend request for " + obj.message.externalEmail + " by " + obj.user.emails[0].value);
            // Store Certificates
            var details = userObj.config.untrustedCert[obj.message.externalEmail], name = details.host + "_" + obj.message.externalEmail;
            if (details.port && parseInt (details.port) !== 443) {
                name = details.host + ":" + details.port + "_" + obj.message.externalEmail;
            }
            if (!userObj.config.cert.external.hasOwnProperty (name)) {
                userObj.config.cert.external[name] = details;
                userObj.config.storeDetails(require("path").join("certificates", "external"), "certificates", userObj.config.cert.external);
                var id = hostname + "_" + userObj.config.userData.email[0].value;
                if (port !== 443) {
                    id = hostname + ":" + port + "_" + userObj.config.userData.email[0].value;
                }
                var certificateParam = userObj.setConnParam();
                refreshPzh (id, certificateParam);
                userObj.pzh_pzh.connectOtherPZH (name, certificateParam);
            }
            if (!userObj.config.trustedList.pzh.hasOwnProperty (name)) {
                userObj.config.trustedList.pzh[name] = {};
                userObj.config.storeDetails(null, "trustedList", userObj.config.trustedList);
            }
            delete userObj.config.untrustedCert[obj.message.externalEmail];
            userObj.config.storeDetails(null, "untrustedList", userObj.config.untrustedCert);
        }
    }

    // Sixth
    function rejectFriend (obj, userObj) {
        if (userObj.config.untrustedCert.hasOwnProperty (obj.message.externalEmail)) {
            logger.log ("Rejecting friend request by " + obj.message.externalEmail + " for " + obj.user);
            delete userObj.config.untrustedCert[obj.message.externalEmail];
            userObj.config.storeUntrustedCert(userObj.config.untrustedCert);
        }
    }

    /* In this alternative flow, we're adding an external user at the same 
     * PZH provider as the current user, so it should be quick and easy.  Just
     * add each PZH's details to the trusted (for the current PZH) and untrusted
     * (for the local friend's PZH) lists.
     */
    function requestAddLocalFriend (obj, userObj) {
        var friendpzh;
        if ((friendpzh = findExistingUserFromEmail(obj.message.externalEmail))) {
            // add the 'friend' to the current user's list of known people.
            logger.log("Adding " + obj.message.externalEmail + " as an external user to " + userObj.config.metaData.webinosName + "'s zone");
            userObj.config.cert.external[friendpzh.config.metaData.serverName] = {
                url          :"https://" + hostname + "/main/" + obj.message.externalEmail + "/",
                host         :hostname,
                port         :port,
                externalCerts:friendpzh.config.cert.internal.master.cert,
                externalCrl  :friendpzh.config.crl,
                serverPort   :80 // TODO
            };
            userObj.config.storeDetails(require("path").join("certificates", "external"), "certificates", userObj.config.cert.external);

            //update the actual list.
            if (!userObj.config.trustedList.pzh.hasOwnProperty (friendpzh.config.metaData.serverName)) {
                userObj.config.trustedList.pzh[friendpzh.config.metaData.serverName] = {};
                userObj.config.storeDetails(null, "trustedList", userObj.config.trustedList);
            }

            var id = hostname + "_" + userObj.config.userData.email[0].value;
            if (port !== 443) {
                id = hostname + ":" + port + "_" + userObj.config.userData.email[0].value;
            }
            refreshPzh (id, userObj.setConnParam()); // Refresh Certificate details in the SNI Context of the farm

            // notify the user about it.  This may or may not be successful, it doesn't
            // really matter.
            var approveURL = "https://" + hostname + "/main/" +
                    encodeURIComponent(friendpzh.config.metaData.webinosName) +
                    "/approve-user/" + encodeURIComponent(userObj.config.metaData.webinosName) + "/";

            logger.log("User data:\n" + require('util').inspect(userObj.config.userData));
            logger.log("Obj data:\n" + require('util').inspect(obj.message));

            notifyUser(
                friendpzh.config.metaData.serverName,
                { "type" : "connection request",
                  "url"  : approveURL,
                  "user" : { "email" : userObj.config.metaData.webinosName,
                             "fullname" : userObj.config.userData.fullname,
                             "nickname" : userObj.config.userData.nickname,
                             "name" : userObj.config.userData.name,
                             "image" : userObj.config.userData.image
                           }
                },
                function(id) { /* don't care */ },
                function(id) { /* don't care */ }
            );

            // add the current user to the friend's list of untrusted people.
            // the friend will later approve or reject the request.
            logger.log("Adding " + userObj.config.metaData.webinosName + " as an external user to " + obj.message.externalEmail + "'s zone");
            friendpzh.config.untrustedCert[userObj.config.metaData.webinosName] = {
                host         :hostname,
                port         :port,
                url          :"https://" + hostname + "/main/" + userObj.config.metaData.webinosName + "/",
                externalCerts:userObj.config.cert.internal.master.cert,
                externalCrl  :userObj.config.crl,
                serverPort   :80 // TODO
            };
            userObj.config.storeDetails(null, "untrustedList", userObj.config.untrustedCert);
            sendMsg( obj.user, { type:"requestAddLocalFriend", message:true });
            return;
        } else {
            sendMsg( obj.user, { type:"requestAddLocalFriend", message:false });
            return;
        }
    }


    function authCode (obj, userObj) {
        var qrCode = require ("./pzh_qrcode.js");
        qrCode.addPzpQRAgain (userObj, function (result) {
            sendMsg( obj.user, { type:"authCode", message:result});
        });
    }

    function csrAuthCodeByPzp (obj, userObj) {
        var payload = userObj.enroll.addNewPZPCert (obj, refreshPzh);
        sendMsg( obj.user, { type:"csrAuthCodeByPzp", message:payload });
    }

    /**
     *
     * @param obj
     * @param userObj
     */
    function removePzh(obj, userObj) {
        userObj.removePzh(obj.message.id, refreshPzh, function(status){
            sendMsg( obj.user, { type:"removePzh", message:status });
        });
    }

    /**
     *
     * @param obj
     * @param userId
     */
    function createPzh (obj, userId) {
        try {
            var pzh_session = require ("./pzh_tlsSessionHandling.js");
            var details, pzhId = hostname + "_" + userId;
            if (port !== 443) {
                pzhId = hostname + ":" + port + "_" + userId;
            }
            if (pzhs[pzhId]) {
                return null;
            } else {
                logger.log ("adding new zone hub - " + pzhId);
                pzhs[pzhId] = new pzh_session ();
                if((details = pzhs[pzhId].addLoadPzh (userId, pzhId, obj.user))){
                    addPzh(details.uri, details.cert);
                    releaseLock ();
                    return pzhId;
                } else {
                    return null;
                }
            }
        } catch (err) {
            logger.log (err);
        }
        return null;
    }

    /**
     *
     * @param email
     * @return {*}
     */
    function findExistingUserFromEmail(email) {
        for (var p in pzhs) {
            if (pzhs.hasOwnProperty (p)) {
                var i;
                for (i = 0; i < pzhs[p].config.userData.email.length; i = i + 1) {
                    if (pzhs[p].config.userData.email[i].value === email) {
                        return pzhs[p];
                    }
                }
            }
        }
        return null;
    }

    /**
     * Based on user email id finds user object.If user does not exists create a user.
     * @param obj -
     * @return {*}
     */
    function findUserFromEmail (obj) {
        var email = obj.user.emails || obj.user;
        var bufferObj = {};
        for (var p in pzhs) {
            if (pzhs.hasOwnProperty (p)) {
                var i, j;
                for (i = 0; i < pzhs[p].config.userData.email.length; i = i + 1) {
                    if (typeof email === "object") {
                        for (j = 0; j < email.length; j = j + 1) {
                            if (pzhs[p].config.userData.email[i].value === email[j].value) {
                                return pzhs[p];
                            }
                        }
                    } else {
                        if (pzhs[p].config.userData.email[i].value === email) {
                            return pzhs[p];
                        }
                    }
                }
            }
        }
        if (getLock ()) {
            setLock ();
            var id;
            if (typeof email === "object") email = (email.email || email[0].value);
            if ((id = createPzh (obj, email))) {
                logger.log ("created pzh - " + id);
                return pzhs[id];
            } else {
                return null;
            }
        }
        return null;
    }

    /**
     * Validates message and responds true /false depending on valid message type
     * @param obj -
     * @return {Boolean}
     */
    function validateMessage (obj) {
        //quick check - TODO: integrate with proper schema checking.
        var valid = obj.hasOwnProperty ("user") && obj.hasOwnProperty ("message") && obj.message !== undefined && obj.message !== null;
        if (!valid) {
            logger.log ("No 'user' or 'message' field in message from web interface");
            return false;
        }
        if (obj.message !== "WEB SERVER INIT") { // Web server init
            valid = obj.message.hasOwnProperty ("type") && obj.message.type !== undefined && obj.message.type !== null &&
                ( messageType.hasOwnProperty (obj.message.type));
            if (!valid) {
                logger.log ("No valid type field in message: " + obj.message.type);
                return false;
            }
        }
        return true;
    }

    /**
     * Process message and check for validity of the message type
     * @param message - message payload
     */
    function processMsg (message) {
        var userObj;
        if (validateMessage (message)) {
            if( message.message === "WEB SERVER INIT") {
                // Do nothing
            } else {
                if (message.message.type !== "checkPzh") {
                    if ((userObj = findUserFromEmail (message))){
                        if (userObj) {
                            messageType[message.message.type].apply(userObj, [message, userObj]);
                        } else {
                            logger.error ("error validating user");
                        }
                    }
                } else {
                    messageType[message.message.type].apply (userObj, [message]);
                }
            }
        } else {
            sendMsg( message.user, {type:"error", "message":"not valid msg"});
        }
    }

    /**
     * Handles data from the WebServer to TLS Server
     * @param data - buffer of data
     */
    this.handleData = function (data) {
        try {
            conn.pause ();
            wUtil.webinosMsgProcessing.readJson (this, data, function (message) {
                processMsg (message);
            });
        } catch (err) {
            logger.error ("exception in processing received message " + err);
        } finally {
            conn.resume ();
        }
    };
};
module.exports = pzhWI
