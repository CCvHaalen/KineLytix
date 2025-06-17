# KineLytix

## Build Instructions (MacOS/Linux/Windows)

### Prepare Backend

Create a Python environment to be used by the backend. Make sure [Python 3.11](https://www.python.org/downloads/) is installed.

- Switch to backend directory

    ```cd backend```

- Create a virtual Python environment

    ```python3 -m venv .venv``` or ```python -m venv .venv```

- Activate the environment

    Mac/Linux ```source .venv/bin/activate```, for Windows ```.venv/Scripts/activate```

- Install dependencies

    ```pip install -r requirements.txt```

- Detect Django model changes

    ```python manage.py makemigrations```

- Apply Django model changes

    ```python manage.py migrate```

- Deactivate virtual Python environment

    ```deactivate```

Go [here](https://packaging.python.org/en/latest/guides/installing-using-pip-and-virtual-environments/) for more information.

### Build Frontend

Building the frontend will automatically bundle the backend into the frontend if the backend has been prepared properly

- Switch to frontend directory

    ```cd ../frontend```

- Install Node with nvm

    ```nvm install```, for windows download Node.js installer from the download link

- Verify the Node.js and npm versions
    ```node -v``` and ```npm -v```

- Activate correct Node version (MacOs/Linux)

    ```nvm use```

- Install dependencies

    ```npm install```

- Build the app

    ```npm run make```

- Restore you path

    ```npm deactivate```

Go [here](https://nodejs.org/en/download/) for more information