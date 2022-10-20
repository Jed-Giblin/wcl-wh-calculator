// ==UserScript==
// @name         Add Talent Calculator Button to WCL
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Adds a button to WCL Talents Breakdown to autobuild the import/export string for talent mangement. It will copy this value to your clipboard.
// @author       Jed Giblin
// @match        https://www.warcraftlogs.com/reports/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=warcraftlogs.com
// @resource     whTrees https://nether.wowhead.com/data/talents-dragonflight
// @grant         GM_getResourceText
// @grant         GM_openInTab
// @grant        GM.xmlHttpRequest
// ==/UserScript==
let debug = false;

let talentRenameMasque = function(badName) {
    let masque = {
        'Sentinel': 'Sentinel Owl'
    };
    return masque[badName] ? masque[badName] : badName;
}

let WH = { points: [], choices: [], nodeTrees: {} }
WH.setPageData = function(key, value) {
    WH[ key.split('.')[key.split('.').length -1] ] = value;
}

let signatureLookup = {
    "Heart Strike": ["death-knight/blood",250,6],
    "Frost Strike": ["death-knight/frost",251,6],
    "Festering Strike": ["death-knight/unholy",252,6],
    "Fel Devestation": ["demon-hunter/vengence", 581, 12],
    "Eye Beam": ["demon-hunter/havoc", 577, 12],
    "Eclipse": ["druid/balance", 102, 11],
    "Tiger's Fury": ["druid/feral", 103, 11],
    "Maul": ["druid/guardian", 104, 11],
    "Lifebloom": ["druid/restoration", 105, 11],
    "Pyre": ["evoker/devestation", 1467, 13],
    "Echo": ["evoker/preservation", 1468, 13],
    "Cobra Shot": ["hunter/beast-mastery", 253, 3],
    "Aimed Shot": ["hunter/marksmanship", 254, 3],
    "Raptor Strike": ["hunter/survival", 255, 3],
    "Arcane Barrage": ["mage/arcane", 62, 8],
    "Pyroblast": ["mage/fire", 63, 8],
    "Ice Lance": ["mage/frost", 64, 8],
    "Keg Smash": ["monk/brewmaster", 268, 10],
    "Enveloping Mist": ["monk/mistweaver", 270, 10],
    "Fists of Fury": ["monk/windwalker", 269, 10],
    "Holy Shock": ["paladin/holy", 65, 2],
    "Avenger's Shield": ["paladin/protection", 66, 2],
    "Blade of Justice": ["paladin/retribution", 70, 2],
    "Atonement": ["priest/discipline", 256, 5],
    "Holy Word: Serentiy": ["priest/holy", 257, 5],
    "Devouring Plague": ["priest/shadow", 258, 5],
    "Deadly Poison": ["rogue/assassination", 259, 4],
    "Opportunity": ["rogue/outlaw", 260, 4],
    "Blade Flurry": ["rogue/outlaw", 260, 4],
    "Improved Backstab": ["rogue/subtlety", 261, 4],
    "Shadow Blades": ["rogue/subtlety", 261, 4],
    "Gloomblade": ["rogue/subtlety", 261, 4],
    "Secret Technique": ["rogue/subtlety", 261, 4],
    "Earth Shock": ["shaman/elemental", 262, 7],
    "Stormstrike": ["shaman/enhancement", 263, 7],
    "Riptide": ["shaman/restoration", 264, 7],
    "Malefic Rapture": ["warlock/affliction", 265, 9],
    "Chaos Bolt": ["warlock/destruction", 267, 9],
    "Call Dreadstalkers": ["warlock/demonology", 266, 9],
    "Mortal Strike": ["warrior/arms", 71, 1],
    "Bloodthirst": ["warrior/fury", 72, 1],
    "Ignore Pain": ["warrior/protection", 73, 1]
}

let generateWowheadLink = function () {
    let talentWindow = document.getElementById('summary-talents-0');
    let spec = null;
    let specTreeId = null;
    let classTreeId = null;
    let listedTalents = {};
    for (let i = 0, row; row = talentWindow.rows[i]; i++) {
        let talentName = talentRenameMasque( row.cells[0].textContent.trim() );
        let allocation = row.cells[1].textContent.trim();

        if ( signatureLookup.hasOwnProperty( talentName ) ) {
            [spec, specTreeId, classTreeId] = signatureLookup[talentName];
        }
        listedTalents[talentName] = Number( allocation );
    }
    if ( debug ) {
        console.log("Found log for class: " + spec );
    }
    let allNodes = {};
    // # MM Hunter Example
    // # [ 3, 254 ]
    [classTreeId, specTreeId].forEach( (treeId) => {
        WH.nodeTrees[treeId] = { points: [], choices: [], skip: 0}
        let tree = WH.trees.find( tree => tree.id == treeId );
        let talentIndices = Object.keys(tree.talents).map( e => parseInt(e)).sort(((e, t) => e - t));
        // [ 4, 8, 12...]
        talentIndices.forEach( (index) => {
            // By Default a node is not chosen
            let pointsAllocated = 0;
            let choiceMade = null;
            let spellName = "";
            let skip = false;
            // [ { node: 0000, spells: [] ]
            tree.talents[index].forEach( (talentNodeMap) => {
                let node = talentNodeMap;
                if ( node.hasOwnProperty("shownForSpecs") && node.shownForSpecs.indexOf( specTreeId ) < 0 ) {
                    // If we can't resolve a nodeInfo object
                    // It means that node is for a different spec tree
                    // e.g. 79935 - Kill Command - BM
                    //      79839 - Kill Command - Surv
                    //      79833 - Kill Shot - Surv
                    //      79835 - Kill Shot - BM
                    //      79837 - Muzzle - Surv
                    //      79912 - Counter Shot - BM
                    return;
                }

                if ( node.hasOwnProperty("cannotDecreaseError") ) {
                    if ( node.defaultSpecs.indexOf( specTreeId ) >= 0 ) {
                        // The builtIn wow code skips "freeNodes". These are nodes auto assigned to your spec
                        skip = false;
                        pointsAllocated = 0;
                        return;
                    }
                }

                let isSelected = false;
                let allocated = -1;
                let partiallySelected = false;
                let index = -1;
                let spell = null;
                let isChoiceNode = false;

                if ( node.type == 3 ) {
                    isChoiceNode = true;
                    // Choice nodes have the needed spell name on one of their entries
                    talentNodeMap.spells.forEach( (entry, i) => {
                        if ( listedTalents.hasOwnProperty( entry.name ) ) {
                            isSelected = true;
                            spell = entry;
                            allocated = listedTalents[ entry.name ];
                            index = i;
                        }
                    // IF a choice node is unselected, the spell name will be Choice 1 / Choice 2
                    });
                } else {
                    spell = node.spells[0];
                    if ( listedTalents.hasOwnProperty( spell.name ) ) {
                        isSelected = true;
                        allocated = listedTalents[ spell.name ];
                    }
                }

                if ( !spell ) {
                    spell = node.spells[0];
                }

                spellName = spell.name;

                if ( isSelected ) {
                    pointsAllocated = allocated;
                    if ( isChoiceNode ) {
                        choiceMade = index;
                    }
                }
            });
            if ( skip ) {
                WH.nodeTrees[treeId].skip++;
                WH.nodeTrees[treeId].points.push( { val: undefined, note: spellName });
                return;
            }
            WH.nodeTrees[treeId].points.push( { val: pointsAllocated, note: spellName });
            if ( choiceMade != null ) {
                WH.nodeTrees[treeId].choices.push({ val: choiceMade, note: spellName });
            }

        });

    });
    const b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let whString = "D";
    let dataTable = [0];
    [classTreeId, specTreeId].forEach( (treeId) => {
        [ WH.nodeTrees[treeId].points, WH.nodeTrees[treeId].choices].forEach( (arr, ii) => {
            let size = Math.ceil( arr.length / 3 );
            dataTable.push( size );
            for ( let i = 0; i < arr.length; i += 3 ) {
                let val1 = arr[i].val;
                let val1Note = arr[i].note;

                let val2 = arr[i + 1] != undefined ? arr[i + 1].val : 0
                let val2Note = arr[i + 1] != undefined ? arr[i+1].note : "Unknown";

                let val3 = arr[i + 2] != undefined ? arr[i + 2].val : 0
                let val3Note = arr[i + 2] != undefined ? arr[i+2].note : "Unknown";

                let bitValue = val1 << 4 | val2 << 2 | val3;
                if ( i >= arr.length ) {
                        return;
                }
                if ( debug && ii == 0) {
                    console.log( `Tuple: [ ${val1} ${val1Note}, ${val2} ${val2Note}, ${val3} ${val3Note}], val: ${bitValue}`);
                }
                dataTable.push( bitValue );
            }
        });
    });
    for( let i = 0; i < dataTable.length; i++ ) {
        whString += b64.charAt( dataTable[i] );
    }
    let url = `https://www.wowhead.com/beta/talent-calc/${spec}/${whString}`;
    GM_openInTab(url, {active: true});
    WH.nodeTrees = {};
}

let fetchTalentDb = function () {
    // Staticly setting trees for now in source to reduce popups
    let url = 'https://nether.wowhead.com/data/talents-dragonflight?locale=0&dataEnv=3&dv=18&uu='+new Date();
    GM.xmlHttpRequest({
        method: "GET",
        url: url,
        onload: function(response) {
            let remoteScript = document.createElement('script')
            remoteScript.id = 'tm-dev-script'
            remoteScript.innerHTML = response.responseText;
            document.body.appendChild(remoteScript);
            eval( document.getElementById('tm-dev-script').text );
            generateWowheadLink();
        }
    })

};

(function () {
    'use strict';
    var numAttempts = 0;
    var tryNow = function () {
        var elem = document.getElementById('summary-talents-0');
        if (elem) {
            let btnGenerate = document.createElement("button");
            btnGenerate.onclick = fetchTalentDb;
            btnGenerate.innerText = "Generate Wowhead Calc";
            let areaDiv = [...document.querySelectorAll('div')].find(div => div.textContent == "Talents");
            areaDiv.append(btnGenerate);
        } else {
            numAttempts++;
            if (numAttempts >= 15) {
                console.warn('Giving up after 34 attempts. Could not find: ' + readySelector);
            } else {
                setTimeout(tryNow, 250 * Math.pow(1.1, numAttempts));
            }
        }
    };
    tryNow();
    // window.addEventListener('load', generateWowheadLink, false);
    // Your code here...
})();
