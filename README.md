# KineLytix

## Build Instructions (MacOS/Linux)

### Prepare Backend

Create a Python environment to be used by the backend. Make sure [Python 3.11](https://www.python.org/downloads/) is installed.

- Switch to backend directory

    ```cd backend```

- Create a virtual Python environment

    ```python3 -m venv .venv```

- Activate the environment

    ```source .venv/bin/activate```

- Install dependencies

    ```python3 -m pip install -r requirements.txt```

- Deactivate virtual Python environment

    ```deactivate```

Go [here](https://packaging.python.org/en/latest/guides/installing-using-pip-and-virtual-environments/) for more information.

### Build Frontend

Building the frontend will automatically bundle the backend into the frontend if the backend has been prepared properly

- Switch to frontend directory

    ```cd ../frontend```

- Install Node with nvm

    ```nvm install```

- Activate correct Node version

    ```nvm use```

- Install dependencies

    ```npm install```

- Build the app

    ```npm run make```

- Restore you path

    ```npm deactivate```

Go [here](https://nodejs.org/en/download/) for more information