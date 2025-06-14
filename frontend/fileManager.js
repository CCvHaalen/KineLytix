const FileManager = (() => {
  let _ipcRenderer;
  let _elements;

  async function fetchFoldersInternal() {
    if (!_ipcRenderer || !_elements || !_elements.folderList) {
      console.error("FileManager is not initialized properly or folderList element is missing.");
      return;
    }

    _elements.folderList.innerHTML = '<li>Loading folders...</li>';
    try {
      const result = await _ipcRenderer.invoke('fetch-data', 'api/folders/');
      if (result.success) {
        populateFolderListInternal(result.data);
      } else {
        console.error('Failed to fetch folders:', result.error);
        _elements.folderList.innerHTML = '<li>Error loading folders</li>';
      }
    } catch (error) {
      console.error('IPC Error:', error);
      _elements.folderList.innerHTML = '<li>Error loading folders</li>';
    }
  }

  function populateFolderListInternal(folders) {
    if (!_elements || !_elements.folderList) return;
    _elements.folderList.innerHTML = '';

    if (!folders || folders.length === 0) {
      _elements.folderList.innerHTML = '<li>No folders found.</li>';
      return;
    }

    folders.forEach(folder => {
      const folderLi = document.createElement('li');
      folderLi.classList.add('folder-item');
      folderLi.dataset.folderId = folder.id;
      folderLi.dataset.expanded = 'false';

      const toggleIcon = document.createElement('span');
      toggleIcon.classList.add('toggle-icon');
      toggleIcon.textContent = '▶ ';

      const folderNameSpan = document.createElement('span');
      folderNameSpan.classList.add('folder-name');
      folderNameSpan.textContent = folder.name || `Folder ${folder.id}`;

      folderLi.appendChild(toggleIcon);
      folderLi.appendChild(folderNameSpan);

      const actionMenu = document.createElement('div');
      actionMenu.classList.add('folder-actions');
      actionMenu.innerHTML = `
        <div class="dots">\u22EE</div>
        <div class="action-menu hidden">
          <div class="action-item" data-action="export">Export to CSV</div>
          <div class="action-item" data-action="rename">Rename</div>
          <div class="action-item" data-action="remove">Remove</div>
        </div>
      `;
      folderLi.appendChild(actionMenu);

      const videosUl = document.createElement('ul');
      videosUl.classList.add('video-sublist');
      videosUl.style.display = 'none';
      folderLi.appendChild(videosUl);

      folderLi.addEventListener('click', async (event) => {
        if (event.target.closest('.video-item')) return;

        const isExpanded = folderLi.dataset.expanded === 'true';
        folderLi.dataset.expanded = !isExpanded;
        toggleIcon.textContent = isExpanded ? '▶ ' : '▼ ';
        videosUl.style.display = isExpanded ? 'none' : 'block';

        if (!isExpanded && videosUl.children.length === 0) {
          await fetchVideosForFolderInternal(folder.id, videosUl);
        }
      });

      folderLi.addEventListener('mouseenter', () => {
        actionMenu.querySelector('.dots').style.display = 'block';
      });
      folderLi.addEventListener('mouseleave', () => {
        actionMenu.querySelector('.dots').style.display = 'none';
        actionMenu.querySelector('.action-menu').classList.add('hidden');
      });

      actionMenu.querySelector('.dots').addEventListener('click', (e) => {
        e.stopPropagation();
        actionMenu.querySelector('.action-menu').classList.toggle('hidden');
      });

      actionMenu.querySelectorAll('.action-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = item.dataset.action;
          const folderId = folder.id;
          const currentFolderName = folder.name;

          if (action === 'export') {
            console.log(`Export action for folderId: ${folderId}, name: ${currentFolderName}`);
            FileManager.exportFolderToCSV(folderId, currentFolderName);
          } else if (action === 'rename') {
            promptRenameFolder(folderId, folderName);
          } else if (action === 'remove') {
            deleteFolder(folderId);
          }
        });
      });

      _elements.folderList.appendChild(folderLi);
    });
  }

  async function fetchVideosForFolderInternal(folderId, videosUlElement) {
    videosUlElement.innerHTML = '<li>Loading videos...</li>';
    try {
      const result = await _ipcRenderer.invoke('fetch-data', `api/videos/?folder=${folderId}`);
      if (result.success) {
        displayVideosInFolderInternal(result.data, videosUlElement);
      } else {
        videosUlElement.innerHTML = '<li>Error loading videos.</li>';
      }
    } catch (error) {
      videosUlElement.innerHTML = '<li>Error loading videos via IPC.</li>';
    }
  }

  function displayVideosInFolderInternal(videos, videosUlElement) {
    videosUlElement.innerHTML = '';
    if (!videos || videos.length === 0) {
      videosUlElement.innerHTML = '<li>No videos in this folder.</li>';
      return;
    }

    videos.forEach(video => {
      const videoLi = document.createElement('li');
      videoLi.classList.add('video-item');
      const videoName = video.title || (video.file ? video.file.split('/').pop() : `Video ${video.id}`);
      videoLi.textContent = videoName;
      videoLi.dataset.videoId = video.id;
      videoLi.dataset.videoTitle = videoName;
      videoLi.dataset.videoPath = video.file

      videoLi.addEventListener('click', () => {
        const videoPath = videoLi.dataset.videoPath;
        const title = videoLi.dataset.videoTitle;
        console.log('[FileManager] Clicked video item. Path:', videoPath, 'Title:', title);
        console.log('[FileManager] Checking window.loadVideoFromManager. Type:', typeof window.loadVideoFromManager);
        if (typeof window.loadVideoFromManager !== 'function') {
            console.log('[FileManager] window.loadVideoFromManager value:', window.loadVideoFromManager);
        }
        
        if (videoPath && typeof window.loadVideoFromManager === 'function') {
          window.loadVideoFromManager(videoPath, title);
        } else {
          console.error('Could not load video: Path missing or loadVideoFromManager not defined.', video);
        }
      });

      videosUlElement.appendChild(videoLi);
    });
  }

    async function _internalDeleteFolderLogic(folderId) {
    if (!_ipcRenderer) {
      console.error("FileManager: IPC Renderer not available for _internalDeleteFolderLogic.");
      return { success: false, error: "IPC Renderer not initialized." };
    }
    try {
      const result = await _ipcRenderer.invoke('delete-data', `api/folders/${folderId}/`);
      if (result.success) {
        fetchFoldersInternal();
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Unknown error from main process.' };
      }
    } catch (error) {
      return { success: false, error: error.message || "IPC communication error." };
    }
  }

    async function _fetchFoldersData() {
      if (!_ipcRenderer) {
          console.error("FileManager: IPC Renderer not available for _fetchFoldersData.");
          return { success: false, error: "IPC Renderer not initialized.", data: [] };
      }
      try {
          const result = await _ipcRenderer.invoke('fetch-data', 'api/folders/');
          if (result.success && result.data) {
              return { success: true, data: result.data };
          } else {
              console.error('Failed to fetch folders data:', result.error);
              return { success: false, error: result.error || "Unknown error fetching folders", data: [] };
          }
      } catch (error) {
          console.error('IPC Error fetching folders data:', error);
          return { success: false, error: error.message, data: [] };
      }
    }

    async function _exportFolderToCSVInternal(folderId, folderName) {
      if (!_ipcRenderer) {
        console.error("FileManager: IPC Renderer not available for CSV export.");
        alert("Error: Could not initiate CSV export. IPC unavailable.");
        return;
      }

      try {
        console.log(`Exporting folder ID: ${folderId}, Name: ${folderName}`);
        _elements.folderList.querySelector(`li[data-folder-id="${folderId}"]`).classList.add('exporting'); // Visual feedback

        const result = await _ipcRenderer.invoke('fetch-data', `api/videos/?folder=${folderId}`);
        
        if (!result.success || !result.data) {
          console.error('Failed to fetch videos for folder:', result.error);
          alert(`Error fetching videos for folder ${folderName}: ${result.error || 'Unknown error'}`);
          return;
        }

        const videos = result.data;
        const csvDataRows = [];
        const fields = ['date', 'participantId', 'task', 'configuration', 'trial', 'frameNumber', 'frameAngleMeasurement'];

        videos.forEach(video => {
          if (video.participant_data && Array.isArray(video.participant_data.measurements)) {
            const pData = video.participant_data;
            pData.measurements.forEach(measurement => {
              csvDataRows.push({
                date: pData.date || '',
                participantId: pData.participantId || '',
                task: pData.task || '',
                configuration: pData.configuration || '',
                trial: pData.trial || '',
                frameNumber: measurement.frameNumber,
                frameAngleMeasurement: typeof measurement.frameAngleMeasurement === 'number' 
                                        ? measurement.frameAngleMeasurement.toFixed(2) 
                                        : ''
              });
            });
          }
        });

        if (csvDataRows.length === 0) {
          alert(`No measurement data found in folder "${folderName}" to export.`);
          return;
        }

        if (typeof json2csv === 'undefined' || typeof json2csv.parse !== 'function') {
            alert('Error: CSV parsing library (json2csv) is not available.');
            console.error('json2csv is not loaded or not a function.');
            return;
        }
        if (typeof downloadCsv !== 'function') { 
            alert('Error: CSV download function is not available.');
            console.error('downloadCsv function is not found.');
            return;
        }

        const csvString = json2csv.parse(csvDataRows, { fields });
        const filename = `Export_${folderName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        
        downloadCsv(filename, csvString);

      } catch (error) {
        console.error('Error during CSV export:', error);
        alert(`An error occurred during CSV export for folder ${folderName}: ${error.message}`);
      } finally {
          if (_elements.folderList) {
              const folderItem = _elements.folderList.querySelector(`li[data-folder-id="${folderId}"]`);
              if (folderItem) folderItem.classList.remove('exporting');
          }
      }
    }
  return {
    init: (ipcRendererInstance, domElements) => {
      _ipcRenderer = ipcRendererInstance;
      _elements = domElements;
    },
    activateView: () => {
      if (!_elements || !_elements.fileManagerView || !_elements.folderList) return;
      fetchFoldersInternal();
    },
    refreshNow: () => {
      fetchFoldersInternal();
    },
    performDeleteFolder: async (folderId) => {
      if (!confirm(`Are you sure you want to delete folder (ID: ${folderId}) and all its contents? This action cannot be undone.`)) {
        return { success: false, error: "User cancelled deletion." }; 
      }
      const result = await _internalDeleteFolderLogic(folderId);
      if (result.success) {
        alert('Folder deleted successfully.');
      } else {
        alert(`Failed to delete folder: ${result.error}`);
      }
      return result;
    },
    getFolders: async () => {
      const result = await _fetchFoldersData();
      return result.data;
    },
    exportFolderToCSV: async (folderId, folderName) => {
      await _exportFolderToCSVInternal(folderId, folderName);
    }
  };
})();



// function exportFolderToCSV(folderId) {
//   // TODO: Fetch data and export CSV
// }

function renameFolder(folderId, currentName) {
  // TODO: add rename folder functionality
}

async function deleteFolder(folderId) {
  if (window.FileManager && typeof window.FileManager.performDeleteFolder === 'function') {
    await window.FileManager.performDeleteFolder(folderId);
  } else {
    console.error('Opps no work');
  }
}

window.FileManager = FileManager;
