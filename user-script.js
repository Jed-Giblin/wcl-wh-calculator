// ==UserScript==
// @name         Add Talent Calculator Button to WCL
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Adds a button to WCL Talents Breakdown to autobuild the import/export string for talent mangement. It will copy this value to your clipboard.
// @author       Jed Giblin
// @match        https://www.warcraftlogs.com/reports/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=warcraftlogs.com
// @resource     raidbotsData https://www.raidbots.com/static/data/beta/new-talent-trees.json
// @grant         GM_getResourceText
// @grant         GM_openInTab
// ==/UserScript==
let debug = false;

class BitTable {
    constructor() {
        this.table = [];
        this.bitBase = 6;
        this.b64Table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    }

    addValue(bitWidth, value, extra=null) {
        this.table.push([bitWidth, value, extra]);
    }

    export() {
        let totalBits = 0;
        let currentValue = 0;
        let currentReservedBits = 0;
        let exportString = "";
        this.table.forEach((row) => {
            if ( debug ) {
                console.log(`Row values: ${row}`);
            }
            let remainingBitWidth = row[0];
            let remainingValue = row[1];
            // Increment the totalBits
            totalBits = totalBits + remainingBitWidth;

            while (remainingBitWidth > 0) {
                // Calculate the amount of space left in the current char. 6 - reservedBits
                let spaceInCurrentValue = this.bitBase - currentReservedBits;
                // Calculate the largest value wee can store by l shifting 1 the amount of space we have
                let maxStorableValue = 1 << spaceInCurrentValue;
                // Determine the remainder of our value and our max
                let remainder = remainingValue % maxStorableValue;

                remainingValue = remainingValue >> spaceInCurrentValue;
                currentValue = currentValue + (remainder << currentReservedBits);
                if (spaceInCurrentValue > remainingBitWidth) {
                    currentReservedBits = (currentReservedBits + remainingBitWidth) % this.bitBase;
                    remainingBitWidth = 0;
                } else {
                    exportString = exportString + this.b64Table[currentValue];
                    currentValue = 0;
                    currentReservedBits = 0;
                    remainingBitWidth = remainingBitWidth - spaceInCurrentValue;
                }
            }
        });
        if (currentReservedBits > 0) {
            exportString = exportString + this.b64Table[currentValue];
        }

        return exportString;
    }


}
// 'https://nether.wowhead.com/data/talents-dragonflight?locale=0&dataEnv=3&dv=18&db=1665702808')
let signatureLookup = {
    "Heart Strike": ["death-knight/blood",250,6],
    "Frost Strike": ["death-knight/frost",251,6],
    "Festering Strike": ["death-knight/unholy",252,6],
    "Fel Devastation ": ["demon-hunter/vengeance", 581, 12],
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
    "Earth Shock": ["shaman/enhancement", 262, 7],
    "Stormstrike": ["shaman/enhancement", 263, 7],
    "Riptide": ["shaman/restoration", 264, 7],
    "Malefic Rapture": ["warlock/affliction", 265, 9],
    "Chaos Bolt": ["warlock/destruction", 267, 9],
    "Call Dreadstalkers": ["warlock/demonology", 266, 9],
    "Mortal Strike": ["warrior/arms", 71, 1],
    "Bloodthirst": ["warrior/fury", 72, 1],
    "Ignore Pain": ["warrior/protection", 73, 1]
}



let binaryTraverse = function (bt, listedTalents, matchedTalentDb, nodeOrderList, specFilterId) {
    nodeOrderList.forEach( (nodeId) => {
        console.log("Processing row: " + nodeId);
        let key = `${nodeId}-${specFilterId}`;
        let nodeInfo = matchedTalentDb.allNodes[key];

        if ( nodeInfo === undefined ||  ( nodeInfo.hasOwnProperty("freeNode") && nodeInfo.freeNode )) {
            // This node is not for our spec, thus cannot be selected
            bt.addValue( 1, 0, "isNotInTree " + nodeId);
            return;
        }

        let isChoiceNode = nodeInfo.type == "choice";
        let isSelected = false;
        let choiceIndex = -1;
        let allocated = 0;
        let spell = null;
        let isPartiallyAllocated = null;

        if (isChoiceNode) {
            nodeInfo.entries.forEach((entry, index) => {
                if (listedTalents.hasOwnProperty(entry.name)) {
                    isSelected = true;
                    choiceIndex = index;
                    spell = entry;
                    allocated = listedTalents[entry.name];
                }
            });
        } else {
            spell = nodeInfo
            if ( listedTalents.hasOwnProperty(spell.name) ) {
                isSelected = true;
                allocated = listedTalents[spell.name];
            }
        }

        // Always set isSelected
        bt.addValue(1, isSelected ? 1 : 0, "isSelected "+ nodeId);
        if ( isSelected ) {
            if ( debug ) {
                console.log(`isChoiceNode: ${isChoiceNode}, isSelected: ${isSelected}, spellName: ${spell.name}, choiceIndex: ${choiceIndex}, allocated: ${allocated}, ${typeof (allocated)}, maxPoints: ${spell.maxRanks}, spec: ${nodeInfo.specId}`);
            }
            let partiallyAllocated = spell.maxRanks != allocated;
            // Set partiallyAllocated
            bt.addValue( 1, partiallyAllocated ? 1 : 0, "partiallyAllocated " + nodeId );
            if ( partiallyAllocated ) {
                // Because we are partiallyAllocated, set purchasedRanks
                bt.addValue( 6, allocated, "allocated " + nodeId);
            }
            // Set isChoiceNode
            bt.addValue( 1, isChoiceNode ? 1 : 0, "isChoiceNode " + nodeId);
            if ( isChoiceNode ) {
                // Because we are choiceNode, set EntryIndex
                bt.addValue( 2, choiceIndex, "choiceIndex " + nodeId);
            }
        }
    });
};

let generateWowheadLink = function (talentDB) {
    console.log(talentDB);
    let talentWindow = document.getElementById('summary-talents-0');
    let spec = null;
    let specTreeId = null;
    let classTreeId = null;
    let listedTalents = {};
    for (let i = 0, row; row = talentWindow.rows[i]; i++) {
        let talentName = row.cells[0].textContent.trim();
        let allocation = row.cells[1].textContent.trim();

        if ( signatureLookup.hasOwnProperty( talentName ) ) {
            [spec, specTreeId, classTreeId] = signatureLookup[talentName];
        }
        listedTalents[talentName] = Number( allocation );
    }
    if ( debug ) {
        console.log("Found log for class: " + spec );
    }
    let bt = new BitTable();
    let orderedNodeList = Object.values(talentDB).find( def => def.classId == classTreeId && def.specId == specTreeId ).fullNodeOrder;
    let matchedTalentDb = { activeSpecId: specTreeId, allNodes: {} };
    Object.values(talentDB).filter( def => def.classId == classTreeId ).forEach( (tree) => {
        tree.classNodes.forEach( (node) => {
            let key = `${node.id}-${tree.specId}`;
            matchedTalentDb.allNodes[key] = { specId: tree.specId, ...node };
        });
        tree.specNodes.forEach( (node) => {
            let key = `${node.id}-${tree.specId}`;
            matchedTalentDb.allNodes[key] = { specId: tree.specId, ...node };
        });
    });
    if ( matchedTalentDb !== null ) {
        bt.addValue( 8, 1);
        bt.addValue( 16, specTreeId);
        let allNodes = {};
        bt.addValue( 128, 0 );
        binaryTraverse( bt, listedTalents, matchedTalentDb, orderedNodeList, specTreeId);
        let exportString = bt.export();
        let url = `https://www.wowhead.com/beta/talent-calc/blizzard/${exportString}`;
        GM_openInTab(url, { active: true });
        navigator.clipboard.writeText(exportString);
    }
}

let fetchTalentDb = function () {
    let data = GM_getResourceText("raidbotsData");
    generateWowheadLink( JSON.parse(data) );
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
