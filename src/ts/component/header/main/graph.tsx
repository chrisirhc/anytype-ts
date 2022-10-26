import * as React from 'react';
import { RouteComponentProps } from 'react-router';
import { Icon, IconObject } from 'Component';
import { I, Util, DataUtil, keyboard } from 'Lib';
import { blockStore, detailStore, popupStore } from 'Store';
import { observer } from 'mobx-react';

interface Props extends I.HeaderComponent {};

const $ = require('jquery');

const HeaderMainGraph = observer(class HeaderMainGraph extends React.Component<Props, {}> {

	timeout: number = 0;

	constructor (props: any) {
		super(props);
		
		this.onOpen = this.onOpen.bind(this);
		this.onPathOver = this.onPathOver.bind(this);
		this.onPathOut = this.onPathOut.bind(this);
	};

	render () {
		const { rootId, onHome, onForward, onBack, onNavigation, onSearch } = this.props;
		const object = detailStore.get(rootId, rootId, []);

		return (
			<React.Fragment>
				<div className="side left">
					<Icon className="expand big" tooltip="Open as object" onClick={this.onOpen} />
					<Icon className="home big" tooltip="Home" onClick={onHome} />
					<Icon className={[ 'back', 'big', (!keyboard.checkBack() ? 'disabled' : '') ].join(' ')} tooltip="Back" onClick={onBack} />
					<Icon className={[ 'forward', 'big', (!keyboard.checkForward() ? 'disabled' : '') ].join(' ')} tooltip="Forward" onClick={onForward} />
					<Icon className="nav big" tooltip="Navigation" onClick={onNavigation} />
				</div>

				<div className="side center">
					<div id="path" className="path" onClick={onSearch} onMouseOver={this.onPathOver} onMouseOut={this.onPathOut}>
						<div className="inner">
							<IconObject object={object} size={18} />
							<div className="name">{object.name}</div>
						</div>
					</div>
				</div>

				<div className="side right" />
			</React.Fragment>
		);
	};

	onOpen () {
		const { rootId } = this.props;

		popupStore.closeAll(null, () => {
			DataUtil.objectOpenRoute({ id: rootId, layout: I.ObjectLayout.Graph });
		});
	};

	onPathOver (e: any) {
		Util.tooltipShow('Click to search', $(e.currentTarget), I.MenuDirection.Center, I.MenuDirection.Bottom);
	};

	onPathOut () {
		Util.tooltipHide(false);
	};

});

export default HeaderMainGraph;