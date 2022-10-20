# wcl-wh-calculator
A Tampermonkey script that will add a button to link to the wowhead talent calculator from WCL

# Installation
1. Install Tampermonkey. This is a Firefox/Chrome extension that allows you to run javascript on pages. The scripts only load/executed based on rules.
2. Create a new userscript and paste the contents of `user-script.js` into that. The header in the file will autoconfigure the values.
3. You're done

# How does it work
* When you are on a WCL report with a talents breakdown, a button will appear. 
* Click that button and it will bring you to wowhead with the talents preselected. You can then export from wowhead to import the build directly into wow
  * You will get prompted to "allow" the URL on first use. This is because the script uses the wowhead DB to fetch the talent trees first. You should allow this.
   

# Breaking on release / updates
* This will probably break on release / talent tree node changes. I'll do my best to get it updated as soon as possible. 
