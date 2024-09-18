import * as React from 'react';
import { observer } from 'mobx-react';
import { AutoSizer, CellMeasurer, InfiniteLoader, List, CellMeasurerCache } from 'react-virtualized';
import { Title, Filter, Select, Icon, Button } from 'Component';
import { I, U, J, S, C, translate, Storage, sidebar, keyboard, analytics, Action } from 'Lib';

import Item from './object/item';

interface State {
	isLoading: boolean;
};

const LIMIT = 20;
const HEIGHT = 64;

const SidebarObject = observer(class SidebarObject extends React.Component<{}, State> {
	
	state = {
		isLoading: false,
	};
	node = null;
	refFilter = null;
	refSelect = null;
	refList = null;
	cache: any = {};
	offset = 0;
	sortId = 'updated';
	sortType: I.SortType = I.SortType.Desc;
	orphan = false;
	type: I.ObjectContainerType = I.ObjectContainerType.Object;
	searchIds: string[] = null;
	filter = '';
	timeoutFilter = 0;
	n = -1;
	selected: string[] = null;
	startIndex = -1;
	currentIndex = -1;

	constructor (props: any) {
		super(props);

		this.onSort = this.onSort.bind(this);
		this.onSwitchType = this.onSwitchType.bind(this);
		this.onFilterChange = this.onFilterChange.bind(this);
		this.onFilterClear = this.onFilterClear.bind(this);
		this.onAdd = this.onAdd.bind(this);
		this.loadMoreRows = this.loadMoreRows.bind(this);
	};

    render() {
		const { isLoading } = this.state;
		const items = this.getItems();
		const isAllowedObject = this.isAllowedObject();
		const typeOptions = this.getTypeOptions();
		const rootId = keyboard.getRootId();

		const rowRenderer = (param: any) => {
			const item: any = items[param.index];
			if (!item) {
				return null;
			};

			return (
				<CellMeasurer
					key={param.key}
					parent={param.parent}
					cache={this.cache}
					columnIndex={0}
					rowIndex={param.index}
				>
					<Item 
						item={item} 
						style={param.style} 
						allowSystemLayout={true}
						onClick={() => this.onClick(item)}
						onContext={() => this.onContext(item)}
						onMouseEnter={() => this.onOver(item)}
						onMouseLeave={() => this.onOut()}
					/>
				</CellMeasurer>
			);
		};

        return (
			<div 
				id="containerObject"
				ref={ref => this.node = ref}
			>
				<div className="inner">
					<div className="head">
						<div className="titleWrap" onClick={() => sidebar.objectContainerToggle()}>
							<Icon className="back" />
							<Title text={translate('commonLibrary')} />
						</div>

						<div className="sides sidesSort">
							<div className="side left">
								<Select 
									id="object-select-type" 
									ref={ref => this.refSelect = ref}
									value=""
									options={typeOptions} 
									onChange={this.onSwitchType}
									menuParam={{
										className: 'fixed',
										classNameWrap: 'fromSidebar',
										offsetY: 4,
									}}
								/>
							</div>
							<div className="side right">
								<Icon id="button-object-sort" className="sort withBackground" onClick={this.onSort} />
							</div>
						</div>

						<div className="sides sidesFilter">
							<div className="side left">
								<Filter 
									ref={ref => this.refFilter = ref}
									icon="search"
									placeholder={translate('commonSearch')}
									onChange={this.onFilterChange}
									onClear={this.onFilterClear}
								/>
							</div>
							<div className="side right">
								{isAllowedObject ? <Button id="button-object-create" color="blank" className="c28" text={translate('commonNew')} onClick={this.onAdd} /> : ''}
							</div>
						</div>
					</div>

					<div className="body">
						{this.cache && items.length && !isLoading ? (
							<div className="items">
								<InfiniteLoader
									rowCount={items.length + 1}
									loadMoreRows={this.loadMoreRows}
									isRowLoaded={({ index }) => !!items[index]}
									threshold={LIMIT}
								>
									{({ onRowsRendered }) => (
										<AutoSizer className="scrollArea">
											{({ width, height }) => (
												<List
													ref={ref => this.refList = ref}
													width={width}
													height={height}
													deferredMeasurmentCache={this.cache}
													rowCount={items.length}
													rowHeight={HEIGHT}
													rowRenderer={rowRenderer}
													onRowsRendered={onRowsRendered}
													overscanRowCount={10}
													scrollToAlignment="center"
												/>
											)}
										</AutoSizer>
									)}
								</InfiniteLoader>
							</div>
						) : ''}
					</div>
				</div>
			</div>
		);
    };

	componentDidMount () {
		const storage = this.storageGet();

		if (storage) {
			this.type = storage.type || I.ObjectContainerType.Object;
			this.orphan = storage.orphan || false;

			const sort = storage.sort[this.type];

			if (sort) {
				this.sortId = sort.id;
				this.sortType = sort.type;
			};
		};

		this.refFilter.focus();
		this.refSelect.setOptions(this.getTypeOptions());
		this.refSelect.setValue(this.type);

		this.rebind();
		this.load(true, () => {
			const rootId = keyboard.getRootId();
			const items = this.getItems();

			this.setActive(items.find(it => it.id == rootId));
		});
	};

	componentDidUpdate () {
		const items = this.getItems();

		this.cache = new CellMeasurerCache({
			fixedWidth: true,
			defaultHeight: HEIGHT,
			keyMapper: i => (items[i] || {}).id,
		});

		this.setActive();
	};

	componentWillUnmount(): void {
		window.clearTimeout(this.timeoutFilter);
		this.unbind();
	};

	rebind () {
		this.unbind();

		$(window).on('keydown.sidebarObject', e => this.onKeyDown(e));
		$(this.node).on('click', e => {
			if (!$(e.target).parents('.item').length) {
				this.selected = null;
				this.renderSelection();
			};
		});
	};

	unbind () {
		$(window).off('keydown.sidebarObject');
		$(this.node).off('click');
	};

	load (clear: boolean, callBack?: (message: any) => void) {
		const option = U.Menu.getObjectContainerSortOptions(this.sortId, this.sortType).find(it => it.id == this.sortId);
		const template = S.Record.getTemplateType();

		let sorts: I.Sort[] = [];
		let filters: I.Filter[] = [
			{ relationKey: 'layout', condition: I.FilterCondition.NotEqual, value: I.ObjectLayout.Participant },
			{ relationKey: 'type', condition: I.FilterCondition.NotEqual, value: template?.id },
		];

		if (option) {
			sorts.push({ relationKey: option.relationKey, type: this.sortType });
		} else {
			sorts = sorts.concat([
				{ type: I.SortType.Desc, relationKey: 'createdDate' },
				{ type: I.SortType.Asc, relationKey: 'name' },
			]);
		};

		if (this.searchIds) {
			filters.push({ relationKey: 'id', condition: I.FilterCondition.In, value: this.searchIds || [] });
		};

		switch (this.type) {
			case I.ObjectContainerType.Object: {
				filters.push({ relationKey: 'layout', condition: I.FilterCondition.NotIn, value: U.Object.getFileAndSystemLayouts().concat([ I.ObjectLayout.Bookmark ]) });
				break;
			};

			case I.ObjectContainerType.Type: {
				filters.push({ relationKey: 'layout', condition: I.FilterCondition.Equal, value: I.ObjectLayout.Type });
				break;
			};

			case I.ObjectContainerType.File: {
				filters.push({ relationKey: 'layout', condition: I.FilterCondition.Equal, value: I.ObjectLayout.File });
				break;
			};

			case I.ObjectContainerType.Media: {
				filters = filters.concat([
					{ relationKey: 'layout', condition: I.FilterCondition.In, value: U.Object.getFileLayouts() },
					{ relationKey: 'layout', condition: I.FilterCondition.NotEqual, value: I.ObjectLayout.File },
				]);
				break;
			};

			case I.ObjectContainerType.Bookmark: {
				filters.push({ relationKey: 'layout', condition: I.FilterCondition.Equal, value: I.ObjectLayout.Bookmark });
				break;
			};

			case I.ObjectContainerType.Relation: {
				filters.push({ relationKey: 'layout', condition: I.FilterCondition.Equal, value: I.ObjectLayout.Relation });
				break;
			};
		};

		if (this.orphan) {
			filters = filters.concat([
				{ relationKey: 'links', condition: I.FilterCondition.Empty, value: null },
				{ relationKey: 'backlinks', condition: I.FilterCondition.Empty, value: null },
			]);
		};

		if (clear) {
			this.setState({ isLoading: true });
			S.Record.recordsSet(J.Constant.subId.allObject, '', []);
		};

		U.Data.searchSubscribe({
			subId: J.Constant.subId.allObject,
			filters,
			sorts,
			offset: 0,
			limit: this.offset + J.Constant.limit.menuRecords,
			ignoreHidden: true,
			ignoreDeleted: true,
		}, (message: any) => {
			this.setState({ isLoading: false });

			if (callBack) {
				callBack(message);
			};
		});
	};

	loadMoreRows ({ startIndex, stopIndex }) {
		return new Promise((resolve, reject) => {
			this.offset += J.Constant.limit.menuRecords;
			this.load(false, resolve);
		});
	};

	loadSearchIds (clear: boolean) {
		if (this.filter) {
			U.Data.search({
				filters: [],
				sorts: [],
				fullText: this.filter,
				keys: [ 'id' ],
			}, (message: any) => {
				this.searchIds = (message.records || []).map(it => it.id);
				this.load(clear);
			});
		} else {
			this.searchIds = null;
			this.load(clear);
		};
	};

	getItems () {
		return S.Record.getRecords(J.Constant.subId.allObject);
	};

	onClick (item: any) {
		U.Object.openAuto(item);
	};

	onContext (item: any) {
		const objectIds = this.selected ? this.selected : [ item.id ];

		S.Menu.open('dataviewContext', {
			recalcRect: () => { 
				const { x, y } = keyboard.mouse.page;
				return { width: 0, height: 0, x: x + 4, y: y };
			},
			data: {
				objectIds,
				subId: J.Constant.subId.allObject,
				route: analytics.route.allObjects,
				allowedLink: true,
				allowedOpen: true,
			}
		});
	};

	onSort (e: any) {
		const options = U.Menu.getObjectContainerSortOptions(this.sortId, this.sortType);

		let menuContext = null;

		S.Menu.open('select', {
			element: '#sidebar #containerObject #button-object-sort',
			horizontal: I.MenuDirection.Right,
			offsetY: 4,
			className: 'fixed',
			classNameWrap: 'fromSidebar',
			onOpen: context => menuContext = context,
			data: {
				options,
				noClose: true,
				onSelect: (e: any, item: any) => {
					this.sortId = item.id;
					this.sortType = item.type;
					this.load(true);

					const storage = this.storageGet();
					const options = U.Menu.getObjectContainerSortOptions(this.sortId, this.sortType);
					
					storage.sort[this.type] = { id: item.id, type: item.type };

					this.storageSet(storage);

					menuContext.ref.updateOptions(options);
				},
			}
		});
	};

	onAdd () {
		const details = {
			...this.getDetailsByType(this.type),
			name: this.filter,
		};

		const cb = (id: string) => {
			if (id && this.filter && this.searchIds) {
				this.searchIds = this.searchIds.concat(id);
				this.load(false);
			};
		};

		if (this.type == I.ObjectContainerType.Bookmark) {
			this.onBookmarkMenu(details, cb);
		} else
		if (this.type == I.ObjectContainerType.Relation) {
			this.onRelationMenu(cb);
		} else {
			keyboard.pageCreate(details, analytics.route.allObjects, (message: any) => {
				cb(message.targetId);
			});
		};
	};

	isAllowedObject (): boolean {
		const canWrite = U.Space.canMyParticipantWrite();

		return canWrite && ![ 
			I.ObjectContainerType.File, 
			I.ObjectContainerType.Media, 
		].includes(this.type);
	};

	onSwitchType (id: string) {
		const storage = this.storageGet();

		if (id == I.ObjectContainerType.Orphan) {
			this.orphan = !this.orphan;
			storage.orphan = this.orphan;
		} else {
			this.type = id as I.ObjectContainerType;
			storage.type = this.type;
		};

		this.storageSet(storage);
		this.refSelect.setOptions(this.getTypeOptions());
		this.refSelect.setValue(this.type);
		this.load(true);
	};

	getTypeOptions () {
		return ([
			{ id: I.ObjectContainerType.Object, name: translate('sidebarObjectTypeObject') },
			{ id: I.ObjectContainerType.File, name: translate('sidebarObjectTypeFile') },
			{ id: I.ObjectContainerType.Media, name: translate('sidebarObjectTypeMedia') },
			{ id: I.ObjectContainerType.Bookmark, name: translate('sidebarObjectTypeBookmark') },
			{ id: I.ObjectContainerType.Type, name: translate('sidebarObjectTypeType') },
			{ id: I.ObjectContainerType.Relation, name: translate('sidebarObjectTypeRelation') },
			{ id: I.ObjectContainerType.Orphan, icon: `checkbox c${Number(this.orphan)}`, name: translate('sidebarObjectTypeOrphan') },
		] as any[]).map(it => {
			if (it.id != I.ObjectContainerType.Orphan) {
				it.className = 'weightMedium';
			};
			return it;
		});
	};

	getDetailsByType (t: I.ObjectContainerType) {
		const details: any = {};

		let type = null;

		switch (t) {
			case I.ObjectContainerType.Bookmark: {
				type = S.Record.getBookmarkType();
				break;
			};

			case I.ObjectContainerType.Type: {
				type = S.Record.getTypeType();
				break;
			};
		};

		if (type) {
			details.type = type.id;
		};

		return details;
	};

	onFilterChange (v: string) {
		window.clearTimeout(this.timeoutFilter);
		this.timeoutFilter = window.setTimeout(() => {
			if (this.filter == v) {
				return;
			};

			this.filter = v;
			this.loadSearchIds(true);
		}, J.Constant.delay.keyboard);
	};

	onFilterClear () {
		this.searchIds = null;
		this.load(true);
	};

	onBookmarkMenu (details: any, callBack: (id: string) => void) {
		const node = $(this.node);
		const width = node.width() - 32;

		S.Menu.open('dataviewCreateBookmark', {
			element: '#sidebar #containerObject #button-object-create',
			offsetY: 4,
			width,
			className: 'fixed',
			classNameWrap: 'fromSidebar',
			horizontal: I.MenuDirection.Right,
			type: I.MenuType.Horizontal,
			data: {
				details,
				onSubmit: object => callBack(object.id),
			},
		});
	};

	onRelationMenu (callBack: (id: string) => void) {
		const node = $(this.node);
		const width = node.width() - 32;

		S.Menu.open('blockRelationEdit', { 
			element: '#sidebar #containerObject #button-object-create',
			offsetY: 4,
			width,
			className: 'fixed',
			classNameWrap: 'fromSidebar',
			horizontal: I.MenuDirection.Right,
			data: {
				filter: this.filter,
				addCommand: (rootId: string, blockId: string, relation: any, onChange: (message: any) => void) => {
					callBack(relation.id);
				},
				deleteCommand: () => {
				},
			}
		});
	};

	onOver (item: any) {
		if (!keyboard.isMouseDisabled) {
			this.setActive(item);
		};
	};

	onOut () {
		if (!keyboard.isMouseDisabled) {
			this.unsetActive();
		};
	};

	onKeyDown (e: any) {
		const items = this.getItems();
		const node = $(this.node);
		const item = items[this.n];

		const selectNext = () => {
			const item = items[this.currentIndex];

			if (this.currentIndex > this.startIndex) {
				this.selected.push(item.id);
			};
			if (this.currentIndex < this.startIndex) {
				this.selected = this.selected.filter(it => it != item.id);
			};
			this.renderSelection();
        };

        const selectPrevious = () => {
			const item = items[this.currentIndex];

			if (this.currentIndex < this.startIndex) {
				this.selected.push(item.id);
			};
			if (this.currentIndex > this.startIndex) {
				this.selected = this.selected.filter(it => it != item.id);
			};
			this.renderSelection();
        };

		keyboard.shortcut('arrowup, arrowdown, shift+arrowup, shift+arrowdown', e, (pressed: string) => {
			const isShift = pressed.match('shift');
			const dir = pressed.match('arrowup') ? -1 : 1;
			const cb = () => {
				let scrollTo = 0;
				if (isShift) {
					dir > 0 ? selectNext() : selectPrevious();

					this.currentIndex += dir;
					if (this.currentIndex == this.startIndex) {
						this.currentIndex += dir;
					};

					this.currentIndex = Math.max(0, this.currentIndex);
					this.currentIndex = Math.min(items.length - 1, this.currentIndex);

					scrollTo = this.currentIndex;
				} else {
					this.setActive();
					scrollTo = this.n;
				};

				this.refList.scrollToRow(Math.max(0, scrollTo));
			};

			// Initial selection
			if (isShift && !this.selected && (this.n >= 0)) {
				this.selected = [ item.id ];

				if (this.startIndex == -1) {
					this.startIndex = this.n;
					this.currentIndex = this.n;
				};
			};

			if (!isShift) {
				this.n += dir;

				if (this.n < 0) {
					this.n = items.length - 1;
				};

				if (this.n >= items.length - 10) {
					this.offset += J.Constant.limit.menuRecords;
					this.load(false, cb);
				} else {
					cb();
				};
			} else {
				cb();
			};
		});

		keyboard.shortcut('escape', e, () => {
			if (this.selected) {
				this.clearSelection();
			} else {
				sidebar.objectContainerToggle();
			};
		});

		if (this.n < 0) {
			return;
		};

		const next = items[this.n];
		if (!next) {
			return;
		};

		const el = node.find(`#item-${next.id}`);
		const isActive = el.hasClass('active');
		const isSelected = el.hasClass('selected');

		if (isActive || isSelected) {
			keyboard.shortcut('arrowright, tab, enter', e, () => {
				e.stopPropagation();
				e.preventDefault();

				this.onClick(next);
			});
		};

		if (isActive || isSelected || this.selected) {
			keyboard.shortcut('backspace, delete', e, () => {
				e.stopPropagation();
				e.preventDefault();

				const ids = this.selected ? this.selected : [ next.id ];
				Action.archive(ids);
			});
		};
	};

	storageGet () {
		const storage = Storage.get('sidebarObject') || {};
		storage.sort = storage.sort || {};
		return storage;
	};

	storageSet (obj: any) {
		Storage.set('sidebarObject', obj);
	};

	renderSelection () {
		const node = $(this.node);

		node.find('.item.selected').removeClass('selected');

		if (this.selected) {
			this.selected.forEach(id => {
				node.find(`#item-${id}`).addClass('selected');
			});
		};
	};

	clearSelection () {
		this.selected = null;
		this.startIndex = -1;
		this.currentIndex = -1;
		this.renderSelection();
	};

	setActive (item?: any) {
		this.unsetActive();

		const items = this.getItems();

		if (!item) {
			item = items[this.n];

			console.log('setActive', this.n, item);
		} else {
			this.n = items.findIndex(it => it.id == item.id);
		};

		if (item) {
			$(this.node).find(`#item-${item.id}`).addClass('active');
		};
	};

	unsetActive () {
		$(this.node).find('.item.active').removeClass('active');
	};

});

export default SidebarObject;