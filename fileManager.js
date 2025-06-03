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
          const folderName = folder.name;

          if (action === 'export') {
            exportFolderToCSV(folderId);
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
      videoLi.textContent = video.title || video.file || `Video ${video.id}`;
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
      // User confirmation
      if (!confirm(`Are you sure you want to delete folder (ID: ${folderId}) and all its contents? This action cannot be undone.`)) {
        return { success: false, error: "User cancelled deletion." }; 
      }
      // Actual deletion logic
      const result = await _internalDeleteFolderLogic(folderId);
      if (result.success) {
        alert('Folder deleted successfully.');
      } else {
        alert(`Failed to delete folder: ${result.error}`);
      }
      return result; // Return result for potential further handling
    },
    getFolders: async () => {
      const result = await _fetchFoldersData();
      return result.data;
    }
  };
})();



function exportFolderToCSV(folderId) {
  // TODO: Fetch data and export CSV
}

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
