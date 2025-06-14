# TNO

## Electron Setup Guide

1. **Check Prerequisites**
   Make sure Node.js and npm are installed:

   ```bash
   node -v
   npm -v
   ```

2. **Project Files**
   Copy the files (including `main.js` and `package.json`) from the GitLab repository into your project directory.

3. **Install Electron**
   Run:

   ```bash
   npm install electron --save-dev
   ```

4. **Run the App**
   Ensure your `package.json` has:

   ```json
   "scripts": {
     "start": "electron ."
   }
   ```

   Then start the app with:

   ```bash
   npm run start
   ```
   
5. **For more information**
   Watch the following video:

   https://youtu.be/3yqDxhR2XxE