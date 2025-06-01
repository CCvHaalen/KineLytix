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
    }
  };
})();

function exportFolderToCSV(folderId) {
  // TODO: Fetch data and export CSV
}

function renameFolder(folderId, currentName) {
  // TODO: add rename folder functionality
}

function deleteFolder(folderId) {
  // TODO: Delete folder functionality
}

window.FileManager = FileManager;
