import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
};

const AboutModal = ({ open, onClose }: Props) => {
  if (!open) return null;

  return (
    <div className="about-backdrop" onClick={onClose}>
      <div className="about-modal" onClick={onClose}>
        <button
          className="icon-btn about-close"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Close"
        >
          <X />
        </button>

        <div className="about-logo">
          <span className="about-logo-mark">
            <span className="brand-b">B</span>
            <span className="brand-z">z</span>
          </span>
          <span className="about-logo-reveal">Bézier</span>
        </div>

        <div className="about-content">
          <h3>Credits</h3>
          <p>Created by Michael Watts.</p>
          <p>Powered by React, Vite, Lucide, Material UI, and react-colorful.</p>
          <h3>Usage License (MIT)</h3>
          <p>
            Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
            associated documentation files (the &quot;Software&quot;), to deal in the Software without restriction,
            including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
            and/or sell copies of the Software.
          </p>
          <p>
            The above copyright notice and this permission notice shall be included in all copies or substantial
            portions of the Software.
          </p>
          <p>
            THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
            NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
            NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
            WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
            SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
